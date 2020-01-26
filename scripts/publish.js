#!/usr/bin/env node
/* Publish.js, publish a new version of the npm package as found in the current directory */
/* Run this file from the root of the repository */

const path = require("path")
const shell = require("shelljs")
const fs = require("fs")
const prompts = require("prompts")
const semver = require("semver")

function run(command, options) {
    const continueOnErrors = options && options.continueOnErrors
    const ret = shell.exec(command, options)
    if (!continueOnErrors && ret.code !== 0) {
        shell.exit(1)
    }
    return ret
}

function exit(code, msg) {
    console.error(msg)
    shell.exit(code)
}

function writeJSON(path, obj) {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, JSON.stringify(obj, null, 2), err => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
    })
}

function maskVerWithX(ver) {
    return ver.replace(/^0/, "X")
}

async function main() {
    const status = run("git status --porcelain -uno", { silent: true })
    if (status.stdout.length > 0) {
        exit(0, "You have uncommited local changes. Aborting...")
    }

    const rootPath = path.resolve(__dirname, "..")
    const rootPkgPath = path.join(rootPath, "package.json")
    const rootPkg = require(rootPkgPath)

    const nextPatch = semver.inc(rootPkg.version, "patch")
    const nextMinor = semver.inc(rootPkg.version, "minor")

    let gitUser = process.env.GIT_USER

    const resp = await prompts(
        [
            {
                type: "select",
                name: "action",
                message: "What do you want to publish?",
                choices: [
                    { title: "Nothing, abort this", value: null },
                    { title: `Patch version (${maskVerWithX(nextPatch)})`, value: nextPatch },
                    { title: `Minor version (${maskVerWithX(nextMinor)})`, value: nextMinor },
                    { title: "Major version - not possible", disable: true }
                ],
                initial: null
            },
            {
                type: action => (!action || gitUser ? null : "text"),
                name: "gitUser",
                message: "Enter the github user to publish the docs with. Empty to skip.",
                initial: gitUser
            }
        ],
        { onCancel: () => exit(0) }
    )

    if (resp.action === null) {
        return
    }
    gitUser = resp.gitUser

    console.log("Starting build...")
    run("npm run small-build")
    console.log("Build is done")

    // Check registry data
    const npmInfoRet = run(`npm info ${rootPkg.name} --json`, {
        continueOnErrors: true,
        silent: true
    })

    if (npmInfoRet.code === 0) {
        const versions = await Promise.all([execute(4, "mobx4"), execute(5, "latest")])
        await writeJSON(rootPkgPath, { ...rootPkg, version: resp.action })
        run(`git commit --no-verify -am "Published version ${maskVerWithX(resp.action)}"`)
        versions.forEach(ver => {
            run(`git tag ${ver}`)
        })
        run("git push")
        run("git push --tags")

        if (gitUser) {
            run(`GIT_USER=${gitUser} USE_SSH=true yarn docs:publish`)
        }
        console.log("Published!")
        exit(0)
    }

    async function execute(major, distTag) {
        const nextVersionParsed = semver.coerce(resp.action)
        nextVersionParsed.major = major
        const nextVersion = nextVersionParsed.format()

        const publishedPackageInfo = JSON.parse(npmInfoRet.stdout)
        if (publishedPackageInfo.versions.includes(nextVersion)) {
            throw new Error(`Version ${nextVersion} is already published in NPM`)
        }

        console.log(`Starting publish of ${nextVersion}...`)

        const distPath = path.resolve(__dirname, "..", "dist", `v${major}`)
        const verPkgPath = path.join(distPath, "package.json")
        const verPkg = require(verPkgPath)
        await writeJSON(verPkgPath, { ...verPkg, version: nextVersion })

        run(`npm publish ${distPath} --tag ${distTag}`)
        return nextVersion
    }
}

main().catch(e => {
    console.error(e)
})

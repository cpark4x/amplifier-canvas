#!/usr/bin/env node

const { spawn } = require('child_process')
const { resolve } = require('path')

const electronPath = require('electron')
const appPath = resolve(__dirname, '..')

const child = spawn(electronPath, [appPath], {
  stdio: 'inherit',
  detached: true,
  env: { ...process.env },
})

child.unref()
process.exit(0)
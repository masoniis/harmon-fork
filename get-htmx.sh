#!/usr/bin/env bash

VERSION=1.9.12

if [ -d htmx ]; then exit; fi

mkdir htmx
cd htmx

wget "https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js"
wget "https://unpkg.com/htmx.org@1.9.12/dist/ext/ws.js"

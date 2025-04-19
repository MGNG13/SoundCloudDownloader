#!/bin/bash
{ cd ../ && sudo node main.min.js > /dev/null 2>&1; echo "Backend Crashed!"; } & { cd ../server_files/ && ./static_files > /dev/null 2>&1; echo "Static Files Crashed!"; } &
@echo off
cd /d C:\Test_NMC_Dashboard\nmc-monorepo
node check-web2.cjs > C:\Test_NMC_Dashboard\web-check-out.txt 2>&1
echo EXITCODE=%errorlevel% >> C:\Test_NMC_Dashboard\web-check-out.txt

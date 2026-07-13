@echo off
cd /d C:\Users\Jcabezas\Downloads\GestaERP\src-tauri\keygen
echo ============================================
echo       GestaERP - Generador de Licencias
echo ============================================
echo.
echo Selecciona el plan:
echo   1. Basico
echo   2. Intermedio
echo   3. Avanzado
echo   4. ONG
echo.
set /p plan_opcion="Ingresa el número del plan (1-4): "
set /p usuarios="Ingresa el número de usuarios: "

if "%plan_opcion%"=="1" set plan=basico
if "%plan_opcion%"=="2" set plan=intermedio
if "%plan_opcion%"=="3" set plan=avanzado
if "%plan_opcion%"=="4" set plan=ong

echo.
echo Generando licencia para plan: %plan% con %usuarios% usuario(s)...
echo.
gestaerp-keygen.exe --plan %plan% --usuarios %usuarios%
echo.
pause
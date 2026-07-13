# Firma de código y distribución profesional - GestaERP

## Estado actual

- `tauri.conf.json` configurado para distribución (`targets: "all"`)
- `LICENSE.md` incluido (MIT License)
- Producto: `GestaERP v1.0.0`
- Icono fuente: `src-tauri/icons/icon.png`

**Nota:** Para generar el `.ico` necesario para NSIS/MSI, ejecutar:
```cmd
npx tauri icon
```

Si no se genera automáticamente, se puede convertir manualmente con ImageMagick:
```cmd
magick src-tauri/icons/icon.png src-tauri/icons/icon.ico
```

## Build actual (después de ~3-4 min)

Generó:
- `src-tauri/target/release/appsdesktop.exe` (ejecutable standalone)
- Error en bundling: `Couldn't find a .ico icon`

El `.exe` se puede ejecutar directamente sin instalador:
```
src-tauri/target/release/appsdesktop.exe
```

## Pasos para generar instalador firmado

### 1. Generar icono .ico
```cmd
npm run tauri icon
# o manualmente:
magick src-tauri/icons/icon.png src-tauri/icons/icon.ico
```

### 2. Compilar con bundling
```cmd
npm run tauri build
```

Genera:
- `src-tauri/target/release/bundle/nsis/*.exe` (instalador NSIS)
- `src-tauri/target/release/bundle/msi/*.msi` (instalador MSI)

### 3. Firma de código

Requisitos:
- Certificado `.pfx` de firma de código (Standard/EV Code Signing)
- `signtool.exe` (incluido con Visual Studio / Windows SDK)

Comandos de firma:
```cmd
signtool sign /f "certificado.pfx" /p "password" /t http://timestamp.digicert.com /v src-tauri/target/release/appsdesktop.exe
signtool sign /f "certificado.pfx" /p "password" /t http://timestamp.digicert.com /v src-tauri/target/release/bundle/nsis/*.exe
```

Verificar:
```cmd
signtool verify /pa src-tauri/target/release/bundle/nsis/*.exe
```

## Distribución final

- Instalador NSIS: `GestaERP_1.0.0_x64-setup.exe`
- Incluye: licencia, acceso directo, desinstalador
- Con firma: Windows SmartScreen muestra "GestaSoftTech" como publisher
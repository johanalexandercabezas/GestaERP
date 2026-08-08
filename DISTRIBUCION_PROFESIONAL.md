# Guía de Distribución Profesional - GestaERP v2.0

## GestaSoftTech - Colombia

---

## 1. REQUISITOS PREVIOS

### Certificado de firma de código (Code Signing)
- Adquirir un certificado EV Code Signing de una autoridad reconocida (Sectigo, DigiCert)
- El certificado debe estar en un token USB o HSM para máxima seguridad
- Costo aproximado: $200-400 USD/año

### Herramientas necesarias
- **NSIS** (Nullsoft Scriptable Install System): https://nsis.sourceforge.io/
- **Microsoft SignTool** (incluido en Windows SDK)
- **Cargo** (Rust) - ya instalado
- **Node.js** + npm - ya instalado

---

## 2. COMPILACIÓN DEL PROYECTO

### 2.1 Generar el Keygen
```bash
cd src-tauri/keygen
cargo build --release
# El ejecutable estará en: src-tauri/keygen/target/release/gestaerp-keygen.exe
```

### 2.2 Compilar GestaERP
```bash
cd c:\Users\Jcabezas\Downloads\GestaERP
npm run tauri build
# El ejecutable y el instalador MSI estarán en: src-tauri/target/release/bundle/
```

### 2.3 Firmar el ejecutable (opcional pero recomendado)
```bash
signtool sign /fd SHA256 /a /tr http://timestamp.digicert.com /td SHA256 /f certificado.pfx /p CONTRASEÑA "src-tauri\target\release\GestaERP.exe"
```

---

## 3. CREACIÓN DEL INSTALADOR PERSONALIZADO (NSIS)

Crear archivo `installer.nsi` en la raíz del proyecto:

```nsis
!define PRODUCT_NAME "GestaERP"
!define PRODUCT_VERSION "2.0.0"
!define PRODUCT_PUBLISHER "GestaSoftTech"
!define PRODUCT_WEB_SITE "https://www.fundasopaco.org"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "GestaERP_Setup_${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES\GestaSoftTech\GestaERP"
RequestExecutionLevel admin

Section "Instalar"
  SetOutPath "$INSTDIR"
  File /r "src-tauri\target\release\bundle\msi\*.*"
  
  CreateDirectory "$APPDATA\GestaERP"
  CreateDirectory "$APPDATA\GestaSoftTech"
  
  CreateShortCut "$DESKTOP\GestaERP.lnk" "$INSTDIR\GestaERP.exe"
  CreateShortCut "$SMPROGRAMS\GestaSoftTech\GestaERP.lnk" "$INSTDIR\GestaERP.exe"
  
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\GestaERP.lnk"
  RMDir /r "$SMPROGRAMS\GestaSoftTech"
  RMDir /r "$INSTDIR"
SectionEnd
```

---

## 4. ENTREGA AL CLIENTE

### Paquete de entrega:
1. **Instalador**: `GestaERP_Setup_2.0.0.exe`
2. **Keygen**: `gestaerp-keygen.exe` (solo para GestaSoftTech, NO entregar al cliente)
3. **Documentación**: `LEEME_CLIENTE.txt`
4. **Licencia**: Clave generada con el keygen

### Proceso de activación para el cliente:
1. Instalar GestaERP con el instalador
2. Abrir la aplicación → Menú → Acerca de → Activar Licencia
3. Ingresar la clave proporcionada (formato: `GESTA-PLAN-XXXXXX`)
4. La licencia queda activada por el período contratado

### Gestión de claves (GestaSoftTech):
```bash
# Iniciar el keygen
cd src-tauri\keygen
cargo run --release

# Comandos disponibles:
#   generar    - Crear nueva licencia
#   listar     - Ver todas las activas
#   buscar     - Buscar cliente
#   revocar    - Desactivar licencia
#   exportar   - Guardar CSV
```

---

## 5. ACTUALIZACIONES POR SOPORTE

El botón "Actualización por Soporte" en Acerca de permite:
1. Seleccionar un nuevo archivo `.exe`
2. La app hace backup automático de la BD en `%APPDATA%/GestaERP/backups/pre_update/`
3. Al cerrar, un script batch reemplaza el ejecutable automáticamente
4. La BD del cliente **NUNCA se toca** - solo se reemplaza el .exe

---

## 6. SEGURIDAD

- **BD cifrada por máquina**: Clave derivada de hostname+username (SQLCipher)
- **Licencias HMAC-SHA256**: Claves no falsificables sin el master secret
- **Master Secret**: Configurado mediante `GESTAERP_SECRET_KEY` en `.env` (sin valor por defecto — la app aborta si no se configura)
- **Autenticación**: Argon2 para contraseñas de usuarios
- **Autorización**: Backend valida roles, no confía en el frontend

---

## 7. CONTACTO

- **Desarrollador**: Johan Alexander Cabezas Huila
- **Empresa**: GestaSoftTech
- **Web**: www.fundasopaco.org
- **Email**: gestaerp@fundasopaco.org
- **País**: Colombia 🇨🇴
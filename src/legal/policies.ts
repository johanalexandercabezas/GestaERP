export interface PolicySection {
  heading: string;
  body: string;
}

export const LEGAL_PROVIDER = {
  name: "Johan Alexander Cabezas Huila",
  taxId: "1006187388 (dato tributario informado por el titular; verificar naturaleza y dígito de validación)",
  project: "Gestasofttech Colombia, registro legal en trámite",
  city: "Cali, Valle del Cauca, Colombia",
  email: "johanalexandercabezas@gmail.com",
};

export const TERMS_SECTIONS: PolicySection[] = [
  {
    heading: "1. Proveedor e identificación",
    body: `${LEGAL_PROVIDER.name} desarrolla y ofrece GestaERP bajo el nombre de proyecto ${LEGAL_PROVIDER.project}. Identificación tributaria informada: ${LEGAL_PROVIDER.taxId}. Domicilio informado: ${LEGAL_PROVIDER.city}. Contacto: ${LEGAL_PROVIDER.email}. Estos datos son provisionales y deben actualizarse cuando finalice el registro legal correspondiente.`,
  },
  {
    heading: "2. Alcance de la licencia",
    body: "GestaERP es un software de escritorio para gestión comercial. La prueba gratuita dura 15 días; las licencias pagas tienen la duración y módulos indicados en la oferta vigente al adquirirlas. Se concede un permiso de uso limitado, no exclusivo e intransferible durante la vigencia de la licencia. La compra y los pagos se rigen además por las condiciones mostradas por el medio de pago.",
  },
  {
    heading: "3. Uso y responsabilidades del cliente",
    body: "El cliente debe usar el software de forma lícita, proteger las cuentas y el dispositivo, mantener actualizados sus datos y conservar respaldos verificables. El negocio que ingresa información de clientes, proveedores o trabajadores determina para qué la usa y debe contar con una base legal y, cuando corresponda, la autorización previa, expresa e informada de cada titular. El operador debe atender sus solicitudes y cumplir sus deberes como responsable del tratamiento.",
  },
  {
    heading: "4. Operación local, copias y disponibilidad",
    body: "La operación ordinaria es local y no requiere internet. Los datos se guardan cifrados en el dispositivo; el usuario sigue siendo responsable de controlar el acceso al equipo y de guardar la frase de recuperación. Los respaldos remotos solo se transmiten si el usuario configura y habilita esa función. El proveedor no promete disponibilidad continua, compatibilidad con todo equipo ni recuperación de datos si se pierden la base, los respaldos y sus claves.",
  },
  {
    heading: "5. Pagos, renovación y terminación",
    body: "Los precios, impuestos aplicables, duración, módulos, renovación y medio de pago deben verificarse en la oferta vigente antes de comprar. La terminación o vencimiento de la licencia puede limitar el acceso a módulos sujetos a licencia; no elimina automáticamente los archivos locales. Antes de desinstalar o cambiar de equipo, el usuario debe exportar y verificar sus respaldos.",
  },
  {
    heading: "6. Propiedad intelectual y restricciones",
    body: "GestaERP, sus marcas, diseños y código pertenecen a sus titulares o licenciantes. La licencia no transfiere su propiedad. No se permite redistribuir, revender, descompilar ni eludir controles de licencia, excepto en los casos que la ley imperativa permita.",
  },
  {
    heading: "7. Alcance funcional y asesoría profesional",
    body: "El ERP y GestaHelp son herramientas de apoyo operativo. Sus informes, cálculos y explicaciones no sustituyen la revisión de un contador, abogado, asesor tributario o profesional de nómina. El negocio debe verificar los resultados y mantener configuraciones acordes con su actividad y la normativa vigente.",
  },
  {
    heading: "8. Garantías y derechos irrenunciables",
    body: `El proveedor atenderá reportes de fallas en ${LEGAL_PROVIDER.email}. Ninguna disposición de estos términos excluye derechos o garantías irrenunciables que reconozca la legislación colombiana ni limita la responsabilidad en los casos en que la ley lo prohíba. Las condiciones comerciales específicas prevalecen en lo que sean más favorables al consumidor cuando legalmente corresponda.`,
  },
  {
    heading: "9. Actualizaciones y cambios",
    body: "El software puede ofrecer actualizaciones para corregir errores o incorporar mejoras. Los cambios sustanciales de estos términos se identificarán con una nueva versión y se solicitará una nueva aceptación antes de continuar usando las funciones sujetas a ellos.",
  },
  {
    heading: "10. Ley aplicable y contacto",
    body: `Estos términos se interpretan conforme a las normas imperativas de Colombia. Para consultas, reclamaciones o solicitudes relacionadas con el software: ${LEGAL_PROVIDER.email}. Versión provisional: 2026-10-v1. Este texto requiere revisión jurídica antes de una distribución comercial general.`,
  },
];

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    heading: "1. Responsable y alcance del aviso",
    body: `${LEGAL_PROVIDER.name}, proyecto ${LEGAL_PROVIDER.project}, identificación tributaria informada ${LEGAL_PROVIDER.taxId}, Cali, Colombia, correo ${LEGAL_PROVIDER.email}, es responsable de los datos personales que trata directamente para ofrecer, licenciar y dar soporte a GestaERP. Este aviso provisional se basa en la Ley 1581 de 2012 y sus normas reglamentarias. La identidad y los datos de contacto deben actualizarse al concluir el registro legal.`,
  },
  {
    heading: "2. Datos y finalidades del proveedor",
    body: `Para atender una compra, licencia, implementación, soporte o solicitud de privacidad, el proveedor puede tratar los datos de identificación y contacto que la persona le comunique directamente y los datos mínimos necesarios para gestionar la relación o investigar un incidente. Se usan para gestionar la relación comercial, dar soporte, responder solicitudes y cumplir obligaciones legales. El medio de pago procesa los datos financieros en su propio sitio y bajo su aviso. No se solicita autorización para publicidad; cualquier uso opcional deberá contar con autorización independiente.`,
  },
  {
    heading: "3. Datos que guarda el ERP del negocio",
    body: "La base del ERP se almacena cifrada en el equipo del cliente; GestaHelp usa reglas locales y consultas a esa base, no un servicio externo de inteligencia artificial. En la operación normal, el proveedor no recibe automáticamente las ventas, clientes, trabajadores, nómina ni conversaciones de GestaHelp. El negocio que incorpora esos datos determina las finalidades y actúa como responsable de ellos; el proveedor solo será encargado si accede a datos por cuenta del negocio, bajo instrucciones y el acuerdo correspondiente.",
  },
  {
    heading: "4. Servicios externos y respaldos",
    body: "Los enlaces de pago pueden abrir el sitio del proveedor de pagos, que trata los datos de la transacción bajo su propio aviso. La consulta o descarga de actualizaciones puede comunicarse con el servicio de distribución configurado. El envío de respaldos remotos es opcional: el archivo se cifra en el cliente antes de transmitirse; el servidor puede recibir el archivo cifrado, tamaño, fecha, dirección de red y datos técnicos de entrega. El operador debe revisar la ubicación, seguridad, retención y condiciones del proveedor de almacenamiento antes de habilitarlo. La asistencia por correo o WhatsApp solo recibe la información que el usuario decida enviar; no adjunte bases ni datos personales salvo que sea estrictamente necesario y exista autorización.",
  },
  {
    heading: "5. Derechos y canales de atención",
    body: `El titular puede conocer, actualizar y rectificar sus datos, solicitar prueba de autorización, preguntar por su uso, presentar reclamos y solicitar supresión o revocatoria cuando proceda, sujeto a deberes legales de conservación y excepciones. Las solicitudes sobre los datos tratados directamente por el proveedor se presentan a ${LEGAL_PROVIDER.email}, indicando “Protección de datos personales”, el derecho solicitado y datos suficientes para verificar la identidad. Para datos que el negocio guardó en su ERP, la solicitud debe dirigirse primero al negocio responsable que los recopiló.`,
  },
  {
    heading: "6. Seguridad, conservación y transferencias",
    body: "El ERP cifra la base local con SQLCipher y guarda la clave en el almacén seguro del sistema operativo; una frase de recuperación puede ser necesaria para recuperar la base. El cifrado reduce riesgos, pero no protege un equipo desbloqueado, malware, copias de pantalla ni claves compartidas. Los datos se conservan durante la relación y el tiempo necesario para finalidades y obligaciones legales; los respaldos conservan su propio ciclo de vida y el usuario debe eliminarlos cuando corresponda. Si se habilita un servidor remoto, pueden existir almacenamiento y tratamiento fuera de Colombia; antes de activarlo se deben verificar las garantías y reglas de transmisión o transferencia aplicables.",
  },
  {
    heading: "7. Autorización de terceros",
    body: "Aceptar este aviso solo deja constancia de que el operador del ERP lo conoció; no es ni sustituye la autorización de clientes, empleados, proveedores u otros titulares. Antes de recopilar o usar sus datos, el negocio debe informar su propia política y finalidades y obtener la autorización que exija la ley, salvo que aplique una excepción legal. Debe contar con un procedimiento para consultar, corregir y suprimir datos y atender reclamos. Evite ingresar datos sensibles si no son necesarios y no existe una base legal adecuada.",
  },
  {
    heading: "8. Incidentes y cambios",
    body: `Para reportar un incidente que involucre datos tratados directamente por el proveedor, escriba a ${LEGAL_PROVIDER.email} con el asunto “Incidente de datos”. Si afecta la base del negocio almacenada localmente, el operador debe proteger el equipo, sus respaldos y claves, evaluar el impacto y cumplir sus deberes de notificación. Este aviso tendrá una nueva versión cuando cambien las finalidades, servicios o responsables. Versión provisional: 2026-10-v1; requiere revisión jurídica antes de una distribución comercial general.`,
  },
];

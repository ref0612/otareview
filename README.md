# Pullman Dashboard — Deploy en Vercel

## Estructura del proyecto
```
pullman-dashboard/
├── api/
│   └── report.js          ← serverless function (el token vive aquí, seguro)
├── public/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── vercel.json
└── README.md
```

## Cómo hacer el deploy

### 1. Instalar Vercel CLI
```bash
npm install -g vercel
```

### 2. Crear cuenta en vercel.com (gratis)
Entra a https://vercel.com y regístrate con GitHub o email.

### 3. Deploy desde esta carpeta
```bash
cd pullman-dashboard
vercel
```
Seguir las preguntas:
- Set up and deploy? → Y
- Which scope? → tu cuenta
- Link to existing project? → N
- Project name? → pullman-dashboard (o el que quieras)
- In which directory is your code? → . (punto, esta misma carpeta)

### 4. Configurar las variables de entorno (el token)

En el dashboard de Vercel → tu proyecto → Settings → Environment Variables:

| Name                   | Value                          | Environments       |
|------------------------|--------------------------------|--------------------|
| PULLMAN_BEARER_TOKEN   | eyJhbGci... (token completo)   | Production, Preview|
| PULLMAN_API_KEY        | QHH79qF2fsWEx98pvNeZpQ         | Production, Preview|

### 5. Re-deploy para que tome las variables
```bash
vercel --prod
```

### 6. Acceder al dashboard
Vercel te entregará una URL tipo:
```
https://pullman-dashboard-xxx.vercel.app
```
Esa URL se la pasas a tu contadora.

---

## Cuando el token expira

El Bearer Token de KonnectPro expira periódicamente.
Cuando eso ocurra, tu contadora verá el banner:
> "⚠️ El token de acceso expiró. Contacta al administrador para renovarlo."

Para renovarlo:
1. Obtén el nuevo token (desde la plataforma Pullman o pestaña Network del browser)
2. Ve a Vercel → Settings → Environment Variables → edita PULLMAN_BEARER_TOKEN
3. Haz un redeploy: `vercel --prod`

El frontend nunca tiene el token expuesto — vive solo en Vercel.
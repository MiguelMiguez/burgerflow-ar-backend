# 🔥 BurgerFlow - Guía Rápida de Uso

## 🚀 Inicio Rápido

### 1. Configurar Variables de Entorno

#### Backend (`.env`)
```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# API Keys (legacy - opcional)
ADMIN_API_KEY=your-admin-key
USER_API_KEY=your-user-key

# Server
PORT=3000
NODE_ENV=development
```

#### Frontend (`.env`)
```env
# Firebase Web SDK
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# API Backend
VITE_API_BASE_URL=http://localhost:3000/api
```

---

## 📝 Ejemplos de Código

### Backend

#### Registrar Usuario + Tenant
```typescript
// POST /api/auth/register
const response = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'dueño@hamburgueseria.com',
    password: 'password123',
    displayName: 'Juan Pérez',
    tenantName: 'La Mejor Hamburguesa'
  })
});

const data = await response.json();
console.log(data);
// {
//   message: "Usuario registrado exitosamente",
//   data: {
//     uid: "abc123",
//     email: "dueño@hamburgueseria.com",
//     tenantId: "tenant-xyz",
//     role: "owner",
//     customToken: "..."
//   }
// }
```

#### Crear Extra
```typescript
// POST /api/extras
// Header: Authorization: Bearer <firebase-token>
const extra = await fetch('http://localhost:3000/api/extras', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${firebaseToken}`
  },
  body: JSON.stringify({
    name: 'Cebolla caramelizada',
    price: 200,
    linkedProductId: 'ingredient-cebolla-id',
    stockConsumption: 50
  })
});
```

#### Actualizar Tenant
```typescript
// PUT /api/tenants/:id
await fetch(`http://localhost:3000/api/tenants/${tenantId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${firebaseToken}`
  },
  body: JSON.stringify({
    hasDelivery: true,
    hasPickup: true
  })
});
```

---

### Frontend

#### Componente de Registro
```tsx
import { useAuth } from '../hooks/useAuth';

function RegisterPage() {
  const { register, loading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await register({
        email: 'user@example.com',
        password: 'password123',
        displayName: 'Usuario Nombre',
        tenantName: 'Mi Hamburguesería'
      });
      
      // Usuario registrado y autenticado
      navigate('/dashboard');
    } catch (err) {
      console.error('Error en registro:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" name="email" required />
      <input type="password" name="password" required />
      <input type="text" name="displayName" />
      <input type="text" name="tenantName" required />
      <button disabled={loading}>Registrar</button>
      {error && <div>{error}</div>}
    </form>
  );
}
```

#### Componente de Login
```tsx
import { useAuth } from '../hooks/useAuth';

function LoginPage() {
  const { login, loading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await login({
        email: 'user@example.com',
        password: 'password123'
      });
      
      navigate('/dashboard');
    } catch (err) {
      console.error('Error en login:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" name="email" required />
      <input type="password" name="password" required />
      <button disabled={loading}>Iniciar Sesión</button>
      {error && <div>{error}</div>}
    </form>
  );
}
```

#### Usar Datos del Usuario
```tsx
import { useAuth } from '../hooks/useAuth';

function Dashboard() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return (
    <div>
      <h1>Bienvenido {user?.displayName}</h1>
      <p>Email: {user?.email}</p>
      <p>Tenant ID: {user?.tenantId}</p>
      <p>Rol: {user?.role}</p>
      <button onClick={logout}>Cerrar Sesión</button>
    </div>
  );
}
```

#### Gestión de Extras
```tsx
import { useState, useEffect } from 'react';
import { getExtras, createExtra, deleteExtra } from '../services/extraService';

function ExtrasPage() {
  const [extras, setExtras] = useState([]);

  useEffect(() => {
    loadExtras();
  }, []);

  const loadExtras = async () => {
    const data = await getExtras(true); // Solo activos
    setExtras(data);
  };

  const handleCreate = async () => {
    await createExtra({
      name: 'Queso cheddar',
      price: 300,
      linkedProductId: 'ingredient-queso-id',
      stockConsumption: 100
    });
    loadExtras();
  };

  const handleDelete = async (id: string) => {
    await deleteExtra(id);
    loadExtras();
  };

  return (
    <div>
      <button onClick={handleCreate}>Agregar Extra</button>
      <ul>
        {extras.map(extra => (
          <li key={extra.id}>
            {extra.name} - ${extra.price}
            <button onClick={() => handleDelete(extra.id)}>Eliminar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 🔧 Utilidades

### Obtener Token de Usuario Actual
```typescript
import { auth } from './firebase';

const user = auth.currentUser;
if (user) {
  const token = await user.getIdToken();
  console.log('Token:', token);
}
```

### Verificar Estado de Autenticación
```typescript
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('Usuario autenticado:', user.uid);
  } else {
    console.log('No hay usuario autenticado');
  }
});
```

### Request con Autenticación Manual
```typescript
import { auth } from './firebase';

const makeAuthRequest = async (url: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('No autenticado');

  const token = await user.getIdToken();
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  return response.json();
};
```

---

## 🧪 Testing con cURL

### Registrar Usuario
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "displayName": "Test User",
    "tenantName": "Test Burger"
  }'
```

### Obtener Token (desde frontend)
```bash
# Primero hacer login en el frontend para obtener el token
# Luego usar el token en los requests
```

### Crear Extra
```bash
curl -X POST http://localhost:3000/api/extras \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -d '{
    "name": "Extra Bacon",
    "price": 250,
    "linkedProductId": "ingredient-bacon-id",
    "stockConsumption": 30
  }'
```

### Listar Extras
```bash
curl -X GET "http://localhost:3000/api/extras?activeOnly=true" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

### Actualizar Tenant
```bash
curl -X PUT http://localhost:3000/api/tenants/TENANT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -d '{
    "hasDelivery": true,
    "hasPickup": false
  }'
```

---

## 📊 Estructura de Datos

### Tenant
```json
{
  "id": "tenant-123",
  "name": "La Mejor Burger",
  "ownerId": "firebase-uid-abc",
  "hasPickup": true,
  "hasDelivery": false,
  "address": "Calle Falsa 123",
  "phone": "+54 11 1234-5678",
  "isActive": true,
  "createdAt": "2026-02-06T12:00:00Z"
}
```

### Extra
```json
{
  "id": "extra-456",
  "tenantId": "tenant-123",
  "name": "Cebolla caramelizada",
  "price": 200,
  "linkedProductId": "ingredient-cebolla-id",
  "stockConsumption": 50,
  "isActive": true,
  "createdAt": "2026-02-06T12:00:00Z"
}
```

### DeliveryZone
```json
{
  "id": "zone-789",
  "tenantId": "tenant-123",
  "name": "Burzaco",
  "price": 500,
  "isActive": true,
  "createdAt": "2026-02-06T12:00:00Z"
}
```

### Product (actualizado)
```json
{
  "id": "product-abc",
  "tenantId": "tenant-123",
  "name": "Hamburguesa Simple",
  "price": 2500,
  "category": "simple",
  "stock": 50,
  "unit": "unidades",
  "available": true,
  "ingredients": [...],
  "createdAt": "2026-02-06T12:00:00Z"
}
```

---

## 🛡️ Seguridad

### Reglas de Firestore (ejemplo)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function getUserTenantId() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.tenantId;
    }
    
    // Usuarios
    match /users/{userId} {
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow write: if false; // Solo el backend puede escribir
    }
    
    // Tenants
    match /tenants/{tenantId} {
      allow read: if isAuthenticated() && getUserTenantId() == tenantId;
      allow write: if isAuthenticated() && getUserTenantId() == tenantId;
      
      // Subcolecciones
      match /{document=**} {
        allow read, write: if isAuthenticated() && getUserTenantId() == tenantId;
      }
    }
  }
}
```

---

## 🚨 Errores Comunes

### "Usuario no encontrado en la base de datos"
**Causa:** El usuario existe en Firebase Auth pero no en Firestore  
**Solución:** Verificar que el endpoint `/auth/register` creó el documento en `/users/{uid}`

### "Token inválido o expirado"
**Causa:** El token de Firebase expiró (expira en 1 hora)  
**Solución:** El SDK renueva automáticamente, usar `getIdToken(true)` para forzar renovación

### "No tienes permiso para acceder a este recurso"
**Causa:** Intentando acceder a recursos de otro tenant  
**Solución:** Verificar que el `tenantId` en el token coincida con el recurso

### "Firebase app not initialized"
**Causa:** Falta configurar variables de entorno de Firebase  
**Solución:** Crear archivo `.env` con las credenciales de Firebase

---

## 📚 Recursos

- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [React Firebase Hooks](https://github.com/CSFrequency/react-firebase-hooks)

---

## 🎯 Checklist de Implementación

- [x] Modelos de datos definidos (User, Tenant, Extra, etc.)
- [x] Backend: Servicios y controladores de autenticación
- [x] Backend: CRUD de Extras
- [x] Backend: Middleware multi-tenant
- [x] Frontend: Firebase Auth configurado
- [x] Frontend: Hook useAuthTenant
- [x] Frontend: AuthContext refactorizado
- [x] Frontend: Servicios de extras
- [ ] Páginas de Login/Registro en UI
- [ ] Gestión de Extras en UI
- [ ] Migración de usuarios existentes
- [ ] Firestore Security Rules configuradas
- [ ] Testing end-to-end

---

**¡BurgerFlow ahora usa Firebase Auth! 🎉**

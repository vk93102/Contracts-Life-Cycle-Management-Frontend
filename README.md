# 🎨 CLM Frontend

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwind-css&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-20.x-green?logo=node.js&logoColor=white)

**Modern, responsive contract management UI** built with Next.js App Router, React 19, and Tailwind CSS.

</div>

---

## 🎯 Overview

A production-ready Next.js frontend featuring:
- ⚡ **Next.js 16 App Router** with React Server Components
- 🎨 **Tailwind CSS** for responsive, beautiful UI
- 🔐 **JWT-based auth** with token refresh
- 📝 **Rich text editor** (Tiptap) for contract editing
- 📄 **PDF viewer & editor** (pdf.js, pdf-lib)
- 📊 **Charts & analytics** (Recharts)
- 🔍 **Advanced search UI** (semantic + full-text)
- 📱 **Fully responsive** mobile & desktop
- 🚀 **Static export** support (Cloudflare Pages)
- ♿ **Accessible** components
- Please visit the backend folder for complete project: https://github.com/vk93102/Contracts-Life-Cycle-Management-Backend

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend                            │
│                    (App Router + RSC)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
  ┌──────────┐                              ┌──────────────┐
  │   App    │                              │  Components  │
  │  Routes  │                              │   Library    │
  ├──────────┤                              ├──────────────┤
  │/login    │                              │• Buttons     │
  │/dashboard│                              │• Forms       │
  │/contracts│◄─────────────────────────────│• Tables      │
  │/search   │                              │• Modals      │
  │/templates│                              │• Layouts     │
  │/settings │                              │• PDF Viewer  │
  └──────────┘                              └──────────────┘
        │                                           │
        ▼                                           ▼
  ┌──────────────────────────────────────────────────────────┐
  │               Core Libraries                          │
  ├──────────────────────────────────────────────────────────┤
  │  • API Client (fetch + token refresh)                │
  │  • Auth Context (React Context + localStorage)       │
  │  • Environment Config (NEXT_PUBLIC_* vars)           │
  └──────────────────────────────────────────────────────────┘
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │             Backend Integration                       │
  │          (Django REST API over HTTPS)                │
  ├──────────────────────────────────────────────────────────┤
  │  • JWT Auth (access + refresh tokens)                │
  │  • RESTful endpoints                                 │
  │  • File uploads (multipart/form-data)               │
  │  • Streaming responses (AI features)                │
  └──────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

### 🔐 Authentication & User Management
- Email/password login with JWT
- OTP verification flow
- Google OAuth integration
- Token refresh (transparent to user)
- Multi-tab session sync
- Protected routes middleware

### 📄 Contract Management
- **Create & edit** contracts with rich text editor
- **Template library** with variable interpolation
- **PDF viewer** with inline annotations
- **Version history** & diff view
- **Clause library** with drag-and-drop
- **Metadata extraction** display
- **Digital signatures** workflow

### 🔍 Advanced Search
- **Semantic search** powered by AI embeddings
- **Full-text search** with filters
- **Faceted navigation** (status, type, date)
- **Saved searches**
- **Search analytics**

### 🤖 AI-Powered Features
- Metadata extraction visualization
- Clause classification UI
- Risk analysis dashboard
- Document summarization
- Similar clause suggestions

### 📊 Dashboard & Analytics
- Contract status overview
- Approval pipeline visualization
- Calendar integration
- Notifications center
- Activity timeline
- Custom reports

### 🎨 UI/UX
- **Responsive design** (mobile, tablet, desktop)
- **Dark mode** support (system preference)
- **Accessible** (keyboard navigation, ARIA)
- **Loading states** & skeleton screens
- **Error boundaries** with retry
- **Toast notifications**

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16.1 (App Router) |
| **UI Library** | React 19 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 3.4 |
| **Rich Text** | Tiptap (ProseMirror) |
| **PDF** | pdf.js, pdf-lib, react-pdf |
| **Charts** | Recharts 3.7 |
| **Icons** | Lucide React |
| **Forms** | Native + validation |
| **HTTP Client** | Fetch API (custom wrapper) |
| **State** | React Context + hooks |

## Project layout

- `app/` — routes + UI (each folder maps to a route)
- `app/components/` — shared UI components
- `app/lib/` — API clients, auth context, environment helpers
- `public/` — static assets
- `docs/` — feature docs, setup, architecture notes

## Environment variables

Copy the example file and fill values:

```bash
cp .env.local.example .env.local
```

Key variables (see `.env.local.example`):

- `NEXT_PUBLIC_API_BASE_URL` — backend base URL (Django/DRF)
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — Google OAuth client id (frontend)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase (frontend usage)

The API base URL is normalized and read from `NEXT_PUBLIC_API_BASE_URL` (preferred) or `NEXT_PUBLIC_API_URL` (legacy).

## Install & run

Requires Node.js **20.x**.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Scripts

- `npm run dev` — start dev server (uses webpack)
- `npm run build` — production build
- `npm run start` — run production server
- `npm run lint` — run ESLint

Notes:

- `postinstall`/`predev`/`prebuild` runs `scripts/copy-pdfjs-assets.mjs`.

## Auth & session model (high level)

- Auth state is provided by an `AuthProvider` mounted in `app/layout.tsx`.
- Tokens and cached user are stored in `localStorage`:
  - `access_token`
  - `refresh_token`
  - `user`
- A token manager emits an `auth:tokens` event to keep tabs/components in sync.
- On refresh, the app bootstraps auth from localStorage and may call `GET /api/auth/me/`.

## Backend integration

The frontend talks directly to the backend configured by `NEXT_PUBLIC_API_BASE_URL`.

Useful backend endpoints:

- Swagger UI: `GET /api/docs/`
- OpenAPI schema: `GET /api/schema/`

## Static export (Cloudflare Pages)

Static export is supported via build-time flag:

```bash
STATIC_EXPORT=1 npm run build
```

When `STATIC_EXPORT=1`:

- Next config sets `output: 'export'`
- `trailingSlash: true`
- images are unoptimized

See `docs/STATIC_EXPORT.md` for details.

---

## 📁 Repository Structure

```
CLM_Frontend/clm-frontend/
├── 📂 app/                  # Next.js App Router
│   ├── layout.tsx           # Root layout (AuthProvider)
│   ├── page.tsx             # Home page
│   │
│   ├── 📂 lib/              # Core libraries
│   │   ├── api.ts           # Legacy API client
│   │   ├── api-client.ts    # Production API client
│   │   ├── auth-context.tsx # Auth state provider
│   │   └── env.ts           # Environment config
│   │
│   ├── 📂 components/       # Shared UI components
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   ├── Table.tsx
│   │   ├── PDFViewer.tsx
│   │   └── ... (40+ components)
│   │
│   ├── 📂 login/            # Auth pages
│   ├── 📂 register/
│   ├── 📂 verify-otp/
│   ├── 📂 forgot-password/
│   │
│   ├── 📂 dashboard/        # Main dashboard
│   ├── 📂 contracts/        # Contract management
│   ├── 📂 templates/        # Template library
│   ├── 📂 search/           # Search interface
│   ├── 📂 approvals/        # Approval workflows
│   ├── 📂 calendar/         # Calendar integration
│   ├── 📂 analytics/        # Analytics dashboard
│   ├── 📂 settings/         # User settings
│   └── 📂 admin/            # Admin panel
│
├── 📂 public/               # Static assets
│   ├── favicon.ico
│   └── pdf.worker.js        # PDF.js worker
│
├── 📂 docs/                 # Documentation
│   ├── README.md            # Docs hub
│   ├── SETUP.md
│   ├── ARCHITECTURE.md
│   ├── FEATURES_INDEX.md
│   └── STATIC_EXPORT.md
│
├── 📂 scripts/              # Build scripts
│   └── copy-pdfjs-assets.mjs
│
├── .env.local.example       # Environment template
├── next.config.ts           # Next.js config
├── tailwind.config.ts       # Tailwind config
├── tsconfig.json            # TypeScript config
├── package.json             # Dependencies
└── README.md                # This file
```

---

## 🔗 Route Structure

### Public Routes
```
/                        # Landing page
/login                   # Login page
/register                # Registration
/verify-otp              # OTP verification
/forgot-password         # Password reset
/terms                   # Terms of service
/privacy                 # Privacy policy
```

### Protected Routes (require auth)
```
/dashboard               # Main dashboard
/contracts               # Contract list
/contracts/[id]          # Contract details
/create-contract         # New contract wizard
/templates               # Template library
/search                  # Search interface
/approvals               # Approval queue
/calendar                # Calendar view
/analytics               # Analytics dashboard
/settings                # User settings
/admin                   # Admin panel (admin only)
```

---

## 🚀 Production Deployment

### Option 1: Standard Next.js Server

```bash
# Build
npm run build

# Start production server
npm start
```

### Option 2: Static Export (Cloudflare Pages)

```bash
# Build static site
STATIC_EXPORT=1 npm run build

# Output: out/ directory
# Deploy to Cloudflare Pages, Netlify, Vercel, etc.
```

### Environment Variables (Production)

```bash
# Backend API
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com

# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...

# Supabase (if using client-side)
NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 🎨 Component Examples

### Using the API Client

```typescript
import { apiClient } from '@/lib/api-client';

// Automatic auth header + token refresh
const contracts = await apiClient.get('/api/v1/contracts/');

// POST with data
const newContract = await apiClient.post('/api/v1/contracts/', {
  title: 'Service Agreement',
  parties: ['Company A', 'Company B']
});
```

### Using Auth Context

```typescript
import { useAuth } from '@/lib/auth-context';

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuth();
  
  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }
  
  return <div>Welcome, {user.email}!</div>;
}
```

---

## 📊 Performance

- **Lighthouse Score**: 95+ (Performance, Accessibility, Best Practices)
- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3.5s
- **Bundle Size**: < 300KB (gzipped, initial)
- **Code Splitting**: Automatic per-route

---

## 🧪 Development Tips

### Hot Reload Issues?
```bash
# Use webpack mode (more stable)
npm run dev
```

### TypeScript Errors?
```bash
# Check types
npx tsc --noEmit
```

### Lint Code
```bash
npm run lint
```

### Clear Cache
```bash
rm -rf .next node_modules
npm install
```

---

## 📚 Documentation

- **Setup Guide**: `docs/SETUP.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Feature Index**: `docs/FEATURES_INDEX.md`
- **Static Export**: `docs/STATIC_EXPORT.md`
- **API Integration**: See backend `CLM_Backend/docs/`

---

## 🤝 Contributing

1. Follow React/Next.js best practices
2. Use TypeScript strictly
3. Follow Tailwind conventions
4. Keep components small & focused
5. Add JSDoc comments for complex logic
6. Test on mobile & desktop

---

## 🐛 Troubleshooting

### "Module not found" errors
```bash
npm install
```

### PDF viewer not working
```bash
node scripts/copy-pdfjs-assets.mjs
```

### Environment variables not loading
- Restart dev server after changing `.env.local`
- Use `NEXT_PUBLIC_` prefix for client-side vars

### CORS errors
- Check backend `CORS_ALLOWED_ORIGINS` includes your frontend URL

---

## 📄 License

Proprietary - Contract Lifecycle Management System

---

<div align="center">

**Built with ❤️ using Next.js & React**

[Frontend Docs](docs/README.md) • [Backend Repo](../CLM_Backend/) • [Architecture](docs/ARCHITECTURE.md)

</div>

# System Design Platform

A comprehensive platform for system design with AI-powered assistance, built with a modern tech stack.

## Architecture

This project follows a monorepo structure with separate frontend and backend applications:

- **Frontend**: Next.js application (`apps/frontend/`)
- **Backend**: Express.js with tRPC API (`apps/backend/`)
- **Database**: PostgreSQL with Prisma ORM (`prisma/`)

## Tech Stack

### Backend

- **Framework**: Express.js
- **API**: tRPC for type-safe APIs
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Language**: TypeScript

### Frontend

- **Framework**: Next.js 15
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **API Client**: tRPC React
- **Authentication**: NextAuth.js
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies for both apps:

```bash
# Install backend dependencies
cd apps/backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. Set up environment variables:

```bash
# Backend (.env in apps/backend/)
cp apps/backend/.env.example apps/backend/.env
# Edit the .env file with your database URL and other settings

# Frontend (.env in apps/frontend/)
cp apps/frontend/.env.example apps/frontend/.env
# Edit the .env file with your backend URL
```

4. Set up the database:

```bash
# Generate Prisma client
cd apps/backend
npm run db:generate

# Run database migrations (if you have a database set up)
npm run db:push
```

### Development

Start both applications in development mode:

```bash
# Terminal 1: Start backend
cd apps/backend
npm run dev

# Terminal 2: Start frontend
cd apps/frontend
npm run dev
```

The backend will run on `http://localhost:3001` and the frontend on `http://localhost:3000`.

## API Structure

The backend provides the following tRPC routers:

- **Design Router**: Manage design sessions (CRUD operations)
- **Question Router**: Handle Q&A flow and question management
- **Canvas Router**: Manage canvas data and elements
- **Export Router**: Handle document generation and templates
- **Admin Router**: System administration and configuration

## Features

- **Design Sessions**: Create and manage system design sessions
- **Interactive Q&A**: AI-powered question generation and answering
- **Visual Canvas**: Interactive design canvas with version control
- **Document Export**: Generate design documents in multiple formats
- **Admin Dashboard**: System monitoring and configuration
- **Role-based Access**: User and admin role management

## Project Structure

```
├── apps/
│   ├── backend/          # Express.js backend
│   │   ├── src/
│   │   │   ├── trpc/     # tRPC routers and setup
│   │   │   ├── lib/      # Database and auth setup
│   │   │   └── index.ts  # Express server
│   │   └── package.json
│   └── frontend/         # Next.js frontend
│       ├── src/
│       │   ├── app/      # Next.js app router
│       │   ├── trpc/     # tRPC client setup
│       │   └── styles/   # Tailwind CSS
│       └── package.json
├── prisma/
│   └── schema.prisma     # Database schema
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

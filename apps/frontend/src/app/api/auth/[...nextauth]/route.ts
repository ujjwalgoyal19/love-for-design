// Mock auth handlers - redirect to backend
export async function GET() {
  return new Response('Redirect to backend auth', {
    status: 302,
    headers: {
      Location: 'http://localhost:3001/auth/signin'
    }
  });
}

export async function POST() {
  return new Response('Redirect to backend auth', {
    status: 302,
    headers: {
      Location: 'http://localhost:3001/auth/signin'
    }
  });
}

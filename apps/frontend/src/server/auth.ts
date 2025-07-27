/**
 * Mock auth for frontend - since you have separate backend,
 * this just provides the interface that the frontend expects
 */

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface Session {
  user?: User;
}

export const auth = async (): Promise<Session | null> => {
  // Return null session since auth is handled by your backend
  return null;
};

export const signIn = async () => {
  // This would typically redirect to your backend auth
  console.log("Sign in - redirect to backend auth");
};

export const signOut = async () => {
  // This would typically redirect to your backend auth
  console.log("Sign out - redirect to backend auth");
};

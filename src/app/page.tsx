import { redirect } from 'next/navigation';

export default function Page() {
  // Server-side redirect from / to /drop
  redirect('/drop');
}
import { NextResponse } from 'next/server';
import { apiAuthed } from '@/lib/session';

/**
 * Creates a shop, by forwarding to the API with the caller's session.
 *
 * This route adds no authorisation of its own. The API checks the platform
 * permission, so a store owner who posts here directly is refused there —
 * the control lives in one place rather than being duplicated and drifting.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
  }

  const result = await apiAuthed<unknown>('/admin/stores', { method: 'POST', body: payload });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

import { NextResponse } from 'next/server';
import { revalidateStore } from '@/lib/revalidate';
import { apiAuthed } from '@/lib/session';

/**
 * Edits or archives one product, forwarding to the API with the session.
 *
 * As with the collection route, no authorisation lives here. The API resolves
 * `storeId` against the caller's memberships and refuses what it should; this
 * file only moves the request and keeps the session token out of the browser.
 */

async function forward(
  context: { params: Promise<{ storeId: string; productId: string }> },
  init: { method: string; body?: unknown },
): Promise<NextResponse> {
  const { storeId, productId } = await context.params;
  const path = `/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`;

  const result = await apiAuthed<unknown>(path, init);

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message, details: result.details },
      { status: result.status },
    );
  }
  // An edit or an archive changes what the storefront should show, so the
  // shop's cached reads are dropped before the response goes back - otherwise
  // the shop owner checks their own shop and sees the old price.
  await revalidateStore(storeId);
  return NextResponse.json(result.data);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ storeId: string; productId: string }> },
): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
  }
  return forward(context, { method: 'PATCH', body: payload });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ storeId: string; productId: string }> },
): Promise<NextResponse> {
  return forward(context, { method: 'DELETE' });
}

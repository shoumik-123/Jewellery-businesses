import { NextResponse } from 'next/server';
import { revalidateStore } from '@/lib/revalidate';
import { apiAuthed } from '@/lib/session';

/**
 * Creates a product, forwarding to the API with the caller's session.
 *
 * The `storeId` comes from the URL, which means it comes from the browser -
 * and that is fine. This route adds no authorisation of its own precisely so
 * there is only one place that decides: the API resolves the id against the
 * session's memberships and answers 404 for a shop the caller is not in, 403
 * for a shop they are in without `product:write`. Duplicating that check here
 * would give it somewhere to drift out of agreement with itself.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ storeId: string }> },
): Promise<NextResponse> {
  const { storeId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
  }

  const result = await apiAuthed<unknown>(`/stores/${encodeURIComponent(storeId)}/products`, {
    method: 'POST',
    body: payload,
  });

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message, details: result.details },
      { status: result.status },
    );
  }
  // The new piece may be live immediately, so the shop's cached storefront
  // reads have to go now rather than when their timer runs out.
  await revalidateStore(storeId);
  return NextResponse.json(result.data, { status: 201 });
}

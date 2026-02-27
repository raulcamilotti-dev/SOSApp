/* ================================================================== */
/*  Shopping Cart — dedicated Worker endpoints                         */
/*  Replaces raw SQL DELETE from frontend with parametrized queries     */
/*                                                                     */
/*  Endpoints:                                                         */
/*    POST /cart/remove-item   — Delete a single cart item by ID        */
/*    POST /cart/clear         — Delete all items from a cart           */
/* ================================================================== */

import { executeQuery } from "./db";
import type { Env } from "./types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUUID(value: unknown, label: string): string {
  const str = String(value ?? "").trim();
  if (!UUID_RE.test(str)) {
    throw new Error(`${label} inválido: deve ser UUID v4`);
  }
  return str;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/* ------------------------------------------------------------------ */
/*  POST /cart/remove-item                                             */
/*  Body: { cartItemId: string }                                       */
/*  Deletes a single shopping_cart_items row by primary key.            */
/* ------------------------------------------------------------------ */

export async function handleRemoveCartItem(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  try {
    const cartItemId = assertUUID(body.cartItemId, "cartItemId");

    const rows = await executeQuery(
      env,
      `DELETE FROM shopping_cart_items WHERE id = $1 RETURNING id`,
      [cartItemId],
    );

    return jsonResponse(200, {
      success: true,
      deleted: (rows as { id: string }[]).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, { error: message });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /cart/clear                                                   */
/*  Body: { cartId: string }                                           */
/*  Deletes all shopping_cart_items for a given cart.                   */
/* ------------------------------------------------------------------ */

export async function handleClearCart(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  try {
    const cartId = assertUUID(body.cartId, "cartId");

    const rows = await executeQuery(
      env,
      `DELETE FROM shopping_cart_items WHERE cart_id = $1 RETURNING id`,
      [cartId],
    );

    return jsonResponse(200, {
      success: true,
      deleted: (rows as { id: string }[]).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, { error: message });
  }
}

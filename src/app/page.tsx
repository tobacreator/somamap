import { redirect } from "next/navigation";

/**
 * The entry point - the owner's approved resolution of `ISS-01`.
 *
 * Before this, `/` rendered the untouched `create-next-app` scaffold: a Next.js advert with links to
 * `vercel.com/new`, and the one screen in the product that carried no fixed line. There is no
 * marketing landing page in this submission, by decision: the product *is* the check-in, so the root
 * route sends the visitor straight to it.
 *
 * A redirect rather than a rendered page, deliberately:
 *   - there is no second screen to keep in step with the check-in copy, and no route that can drift
 *     out of iron rule 5's "every screen shows the fixed line";
 *   - the destination is the real application, so the fixed line, the crisis stop and the card are
 *     reached exactly as a returning user reaches them.
 *
 * `redirect` throws `NEXT_REDIRECT`, which is how this Next version performs a server redirect; the
 * status is 307 by default, so a browser that has cached nothing is not misled by a permanent one.
 */
export default function Home(): never {
  redirect("/checkin");
}

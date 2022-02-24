import { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "../../services/stripe";
import { getSession } from "next-auth/react";
import { fauna } from "../../services/fauna";
import { query as q } from "faunadb";

type User = {
  ref: {
    id: string;
  };
};

// eslint-disable-next-line import/no-anonymous-default-export
export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "POST") {
    const session = await getSession({ req }); // Get the session from the cookie

    const user = await fauna.query<User>(
      q.Get(q.Match(q.Index("users_by_email"), q.Casefold(session.user.email)))
    );

    const stripeCustomer = await stripe.customers.create({
      email: session.user.email,
    });

    await fauna.query(
      q.Update(q.Ref(q.Collection("users"), user.ref.id), {
        data: { stripeCustomerId: stripeCustomer.id },
      })
    ); // Update the user's stripe customer ID

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomer.id,
      payment_method_types: ["card"],
      billing_address_collection: "required",
      line_items: [
        {
          price: "price_1KVMYiBI37kqA0xBHV4z3SX5",
          quantity: 1,
        },
      ],
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: process.env.STRIPE_SUCCESS_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL,
    });
    return res.status(200).json({ sessionId: checkoutSession.id });
  } else {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
  }
};

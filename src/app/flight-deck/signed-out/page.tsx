import Link from "next/link";
import { PageTitle } from "@/components/flight-deck/ui";

export default function SignedOutPage() {
  return (
    <div className="max-w-xl">
      <PageTitle eyebrow="Flight Deck" title="You are signed out">
        Your session has been ended on this device and on the server.
      </PageTitle>
      <Link href="/flight-deck/sign-in" className="tiro-link text-sm">
        Sign in again
      </Link>
    </div>
  );
}

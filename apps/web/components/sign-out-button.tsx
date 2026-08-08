import { signOutAction } from "@/lib/actions/signOut";
import { Button } from "@hrm/ui";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}

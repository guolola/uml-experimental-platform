// Renders the account dialog avatar image or initials fallback.
import type { PlatformUser } from "../services/platform-api";
import { initials } from "../lib/account-dialog-formatting";

export function AccountAvatarPreview({
  src,
  user,
}: {
  src: string;
  user: PlatformUser | null;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt="头像预览"
        className="size-full object-cover"
      />
    );
  }

  return <span>{initials(user)}</span>;
}

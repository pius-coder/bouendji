import { Icon } from "@/components/common/icon";
import { withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { RevokeOtherSessionsButton, RevokeSessionButton } from "./session-actions";
import { describeAgent, formatSessionDate } from "./session-format";

/**
 * Sessions ouvertes du compte, la courante marquée. « Déconnecter » ne vise que les
 * autres sessions : la courante se ferme par « Se déconnecter » du menu.
 */
export async function SessionsSection() {
  const { sessions } = await withSession(() => getServices().auth.listSessions());
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-subhead text-muted-foreground">
        Appareils connectés à ce compte. Une session révoquée doit se reconnecter.
      </p>
      {sessions.length === 0 ? (
        <p className="text-subhead text-muted-foreground">Aucune session active.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-separator overflow-hidden rounded-xl bg-group">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted-foreground">
                  <Icon name="monitor" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-subhead font-semibold">
                    <span className="truncate">{describeAgent(session.userAgent)}</span>
                    {session.current && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-caption-1 font-medium text-accent-text">
                        Cette session
                      </span>
                    )}
                  </p>
                  <p className="text-footnote text-muted-foreground">
                    Connectée le {formatSessionDate(session.createdAt)} · vue le {formatSessionDate(session.lastSeenAt)}
                  </p>
                </div>
              </div>
              {!session.current && <RevokeSessionButton id={session.id} />}
            </li>
          ))}
        </ul>
      )}
      {others > 0 && (
        <div>
          <RevokeOtherSessionsButton />
        </div>
      )}
    </div>
  );
}

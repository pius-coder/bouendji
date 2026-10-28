"use client";

import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { testTelegramAction } from "@/server/actions/network.action";

export function TelegramTestButton() {
  const [pending, startTransition] = React.useTransition();

  const handleTest = () => {
    startTransition(async () => {
      const res = await testTelegramAction();
      if (res.ok) {
        if (res.data.delivered > 0) {
          toast.success(`Message de test Telegram envoyé (${res.data.delivered}/${res.data.recipients} destinataires).`);
        } else {
          toast.error("Aucun destinataire Telegram atteint.");
        }
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleTest}>
      {pending ? <Spinner /> : <Icon name="mail" className="size-4" />}
      Tester Telegram
    </Button>
  );
}

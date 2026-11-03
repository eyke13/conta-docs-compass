import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Abertura automática da competência na virada do mês (agendamento mensal).
export const Route = createFileRoute("/api/public/jobs/abrir-competencia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("abrir_competencia_mensal");
        if (error) return Response.json({ success: false, error: error.message }, { status: 500 });
        return Response.json({ success: true, resultado: data });
      },
    },
  },
});

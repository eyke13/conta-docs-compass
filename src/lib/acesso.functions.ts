import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CONTAS = {
  usuario: "equipe@acesso.interno",
  gestor: "gestor@acesso.interno",
} as const;
const CONTA_VISITANTE = "visitante@acesso.interno";

export const listarOperadoresAtivos = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("operadores").select("id, nome, cargo, ativo").order("ativo", { ascending: false }).order("nome");
  if (error) throw new Error("Falha ao carregar operadores");
  return data ?? [];
});

export const entrarSistema = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ operadorId: z.string().uuid(), gestor: z.boolean(), senha: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin: adm } = await import("@/integrations/supabase/client.server");
    const { data: op } = await adm.from("operadores").select("id, nome, ativo").eq("id", data.operadorId).maybeSingle();
    if (!op) return { ok: false as const, erro: "Operador não encontrado." };
    const { createHash, timingSafeEqual } = await import("node:crypto");
    if (data.gestor) {
      const esperada = process.env["GESTOR_SENHA"] ?? "";
      const a = createHash("sha256").update(data.senha ?? "").digest();
      const b = createHash("sha256").update(esperada).digest();
      if (!esperada || !timingSafeEqual(a, b)) return { ok: false as const, erro: "Senha de gestor incorreta." };
    }
    const papel = data.gestor ? "gestor" : "usuario";
    const s = await abrirSessao(CONTAS[papel], papel, false);
    return {
      ok: true as const,
      gestor: data.gestor,
      operador: { id: op.id, nome: op.nome, ativo: op.ativo },
      access_token: s.access_token,
      refresh_token: s.refresh_token,
    };
  });

export const entrarVisitante = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ nome: z.string().trim().min(3).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const s = await abrirSessao(CONTA_VISITANTE, "visitante", true);
    return { ok: true as const, nome: data.nome, access_token: s.access_token, refresh_token: s.refresh_token };
  });

async function abrirSessao(email: string, papel: "usuario" | "gestor" | "visitante", exclusivo: boolean) {
    const { randomBytes } = await import("node:crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const senhaTemp = randomBytes(24).toString("hex");

    const { data: lista } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    let user = lista?.users.find((u) => u.email === email);
    if (!user) {
      const { data: novo, error } = await supabaseAdmin.auth.admin.createUser({ email, password: senhaTemp, email_confirm: true });
      if (error || !novo.user) throw new Error("Falha ao preparar acesso");
      user = novo.user;
    } else {
      await supabaseAdmin.auth.admin.updateUserById(user.id, { password: senhaTemp });
    }
    if (exclusivo) await supabaseAdmin.from("user_roles").delete().eq("user_id", user.id).neq("role", papel);
    await supabaseAdmin.from("user_roles").upsert({ user_id: user.id, role: papel }, { onConflict: "user_id,role" });

    const { createClient } = await import("@supabase/supabase-js");
    const pub = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: s, error } = await pub.auth.signInWithPassword({ email, password: senhaTemp });
    if (error || !s.session) throw new Error("Falha ao iniciar sessão");
    return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
}

import PptxGenJS from "pptxgenjs";
import fundo from "@/assets/slide/fundo.jpg?inline";
import logo from "@/assets/slide/logo.png?inline";
import iconeDoc from "@/assets/slide/icone-doc.png?inline";
import iconeLigacao from "@/assets/slide/icone-ligacao.png?inline";
import iconeWhats from "@/assets/slide/icone-whatsapp.png?inline";
import iconeCliente from "@/assets/slide/icone-cliente.png?inline";
import iconeConciliacao from "@/assets/slide/icone-conciliacao.png?inline";
import { compParaTela, diaParaTela, type LinhaSlide, type SlideRelatorio } from "./relatoriosSlide";
import { limparPptx } from "./limparPptx";

// Identidade do modelo: marinho #0B1E5B, dourado #D69A20, Arial. Fundo/brasão/rodapé vêm da imagem da própria Elite.
const NAVY = "0B1E5B", GOLD = "D69A20", TEXTO = "2B3553", VERMELHO = "FF0000", PAINEL = "EEF1F8";
const zebra = (i: number) => (i % 2 === 0 ? "E8EDF8" : "DDE5F5");
const FONTE = "Arial";
const LARG = 13.333, ALT = 7.5;
const b64 = (u: string) => u.replace(/^data:/, "");

type Slide = ReturnType<PptxGenJS["addSlide"]>;

function cabecalho(s: Slide, titulo: [string, string], dataTxt: string) {
  s.addImage({ data: b64(fundo), x: 0, y: 0, w: LARG, h: ALT });
  s.addShape("roundRect", { x: 1.2, y: 0.4, w: 11.6, h: 1.45, fill: { color: NAVY }, line: { color: NAVY, width: 1 }, rectRadius: 0.12 });
  s.addImage({ data: b64(logo), x: 1.5, y: 0.6, w: 1.403, h: 1.05 });
  s.addShape("rect", { x: 3.19, y: 0.7, w: 0.02, h: 0.85, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
  s.addText([{ text: titulo[0], options: { color: "FFFFFF", breakLine: true } }, { text: titulo[1], options: { color: GOLD } }],
    { x: 3.45, y: 0.5, w: 6.4, h: 1.25, fontFace: FONTE, fontSize: 28, bold: true, align: "left", valign: "middle" });
  s.addText("DATA", { x: 10.05, y: 0.62, w: 2.45, h: 0.3, fontFace: FONTE, fontSize: 11, bold: true, color: GOLD, align: "center", charSpacing: 4 });
  s.addShape("roundRect", { x: 10.05, y: 0.97, w: 2.45, h: 0.62, fill: { color: NAVY }, line: { color: GOLD, width: 1.25 }, rectRadius: 0.1 });
  s.addText(dataTxt, { x: 10.05, y: 0.97, w: 2.45, h: 0.62, fontFace: FONTE, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
}

/** Cartão do modelo: moldura branca, círculo marinho com ícone dourado, número grande e descrição. */
function cartao(s: Slide, x: number, valor: number | string, linhas: { text: string; color: string }[], icone: string, y = 2.4, tam = 12) {
  s.addShape("roundRect", { x, y, w: 2.12, h: 3.85, fill: { color: "FFFFFF" }, line: { color: NAVY, width: 1.25 }, rectRadius: 0.12 });
  s.addShape("ellipse", { x: x + 0.61, y: y + 0.22, w: 0.9, h: 0.9, fill: { color: NAVY }, line: { color: NAVY, width: 1 } });
  s.addImage({ data: b64(icone), x: x + 0.83, y: y + 0.44, w: 0.46, h: 0.46 });
  s.addText(String(valor), { x: x + 0.075, y: y + 1.22, w: 1.97, h: 1.05, fontFace: FONTE, fontSize: 72, bold: true, color: NAVY, align: "center", valign: "middle" });
  s.addText(linhas.map((l, i) => ({ text: l.text, options: { color: l.color, breakLine: i < linhas.length - 1 } })),
    { x: x + 0.08, y: y + 2.25, w: 1.96, h: 1.55, fontFace: FONTE, fontSize: tam, bold: true, align: "center", valign: "top", lineSpacing: tam + 1 });
}

function painel(s: Slide) {
  s.addShape("roundRect", { x: 1.2, y: 2.15, w: 11.6, h: 4.55, fill: { color: PAINEL }, line: { color: NAVY, width: 1.25, dashType: "dash" }, rectRadius: 0.1 });
}

const LINHAS_POR_PAINEL = 10;
const TAB_Y = 2.34, TAB_X = 4.245, TAB_W = 7.9, ALT_LINHA = 0.3;

/** Tabela do modelo (CÓDIGO, EMPRESA, PERÍODO, PADRINHO) com a faixa marinha logo abaixo. */
function tabela(s: Slide, rows: LinhaSlide[], legenda: string) {
  const cab = ["CÓDIGO", "EMPRESA", "PERÍODO", "PADRINHO"].map((t) => ({ text: t, options: { fill: { color: NAVY }, color: "FFFFFF", bold: true, align: "center" as const } }));
  const corpo = rows.map((r, i) => [r.codigo, r.empresa, r.periodo, r.padrinho].map((t) => ({
    text: t, options: { fill: { color: zebra(i) }, color: NAVY, align: "center" as const },
  })));
  s.addTable([cab, ...corpo], {
    x: TAB_X, y: TAB_Y, w: TAB_W, colW: [1.18, 3.02, 2.23, 1.54], rowH: ALT_LINHA,
    fontFace: FONTE, fontSize: 12, valign: "middle", border: { type: "solid", color: "FFFFFF", pt: 1.5 },
  });
  const faixaY = Math.min(TAB_Y + (rows.length + 1) * ALT_LINHA + 0.15, 6.05);
  s.addShape("roundRect", { x: TAB_X, y: faixaY, w: TAB_W, h: 0.57, fill: { color: NAVY }, line: { color: NAVY, width: 1 }, rectRadius: 0.08 });
  s.addText(legenda, { x: TAB_X + 0.1, y: faixaY, w: TAB_W - 0.2, h: 0.57, fontFace: FONTE, fontSize: 20, bold: true, color: PAINEL, align: "center", valign: "middle" });
}

/** Gera o .pptx do relatório em slide: slide 1 = Cobrança, slide(s) = Conciliação. */
export async function criarSlidePptx(r: SlideRelatorio): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "ELITE", width: LARG, height: ALT });
  pptx.layout = "ELITE";
  pptx.author = "Elite Contábil";
  pptx.company = "Elite Contábil";
  pptx.title = `Relatório em slide — ${compParaTela(r.comp)}`;

  const dataTxt = diaParaTela(r.dia);
  const desdeTxt = diaParaTela(r.desde);
  const compet = compParaTela(r.comp);

  const s1 = pptx.addSlide();
  cabecalho(s1, ["COBRANÇA DE", "DOCUMENTAÇÃO FINANCEIRA"], dataTxt);
  cartao(s1, 2.51, r.solicitacoes, [{ text: "Solicitações com documentações recebidas", color: TEXTO }], iconeDoc);
  cartao(s1, 4.88, r.ligacoes, [{ text: "Ligações realizadas", color: TEXTO }], iconeLigacao);
  cartao(s1, 7.25, r.whats, [{ text: "Contatos por WhatsApp", color: TEXTO }], iconeWhats);
  cartao(s1, 9.62, r.clientes100, [{ text: `Clientes que se tornaram 100% na data — Competência ${compet}`, color: TEXTO }, { text: `Desde ${desdeTxt}`, color: VERMELHO }], iconeCliente, 2.4, 10);

  const blocos: LinhaSlide[][] = [];
  for (let i = 0; i < r.conciliadas.length; i += LINHAS_POR_PAINEL) blocos.push(r.conciliadas.slice(i, i + LINHAS_POR_PAINEL));
  if (!blocos.length) blocos.push([]);
  for (const [n, bloco] of blocos.entries()) {
    const s = pptx.addSlide();
    cabecalho(s, ["CONCILIAÇÃO", "FINANCEIRA"], dataTxt);
    painel(s);
    cartao(s, 1.78, r.mesesConciliados, [{ text: "Meses com financeiro conciliado", color: TEXTO }, { text: desdeTxt, color: VERMELHO }], iconeConciliacao, 2.5, 10);
    tabela(s, bloco, n === 0 ? `EMPRESAS CONCILIADAS ${dataTxt}` : `EMPRESAS CONCILIADAS ${dataTxt} — continuação`);
  }

  return limparPptx((await pptx.write({ outputType: "blob" })) as Blob);
}

import JSZip from "jszip";

const PRESENTACAO = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * A biblioteca que monta o PowerPoint deixa o arquivo com três detalhes que o PowerPoint
 * trata como "arquivo precisa de reparo": elementos fora da ordem no presentation.xml,
 * ids repetidos dentro da mesma slide e referências a partes que não existem no pacote.
 * Este passo reescreve o pacote gerado corrigindo os três, sem mexer em nada do conteúdo.
 */
export async function limparPptx(entrada: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(entrada);

  // 1) No schema, notesMasterIdLst vem antes de sldIdLst.
  const pres = zip.file("ppt/presentation.xml");
  if (pres) {
    const xml = await pres.async("string");
    const bloco = /<p:notesMasterIdLst[\s\S]*?<\/p:notesMasterIdLst>/.exec(xml);
    if (bloco && xml.indexOf(bloco[0]) > xml.indexOf("<p:sldIdLst")) {
      zip.file("ppt/presentation.xml", xml.replace(bloco[0], "").replace("<p:sldIdLst", `${bloco[0]}<p:sldIdLst`));
    }
  }

  // 2) Ids repetidos dentro da mesma slide (a tabela costuma repetir o id de um shape).
  for (const nome of Object.keys(zip.files).filter((n) => /^ppt\/slides?\/slide\d+\.xml$/.test(n))) {
    const arquivo = zip.file(nome);
    if (!arquivo) continue;
    const xml = await arquivo.async("string");
    let max = 0;
    for (const m of xml.matchAll(/<p:cNvPr id="(\d+)"/g)) max = Math.max(max, Number(m[1]));
    const usados = new Set<number>();
    const novo = xml.replace(/<p:cNvPr id="(\d+)"/g, (todo, n) => {
      const v = Number(n);
      if (!usados.has(v)) { usados.add(v); return todo; }
      max += 1; usados.add(max);
      return `<p:cNvPr id="${max}"`;
    });
    if (novo !== xml) zip.file(nome, novo);
  }

  // 3) Sobras de [Content_Types].xml apontando para partes que não foram escritas.
  const ct = zip.file("[Content_Types].xml");
  if (ct) {
    const xml = await ct.async("string");
    const novo = xml.replace(/<Override PartName="([^"]+)"[^>]*\/>/g, (todo, parte) =>
      zip.file(String(parte).replace(/^\//, "")) ? todo : "");
    if (novo !== xml) zip.file("[Content_Types].xml", novo);
  }

  // 4) Reempacota só com arquivos (sem entradas de pasta) e [Content_Types].xml em primeiro,
  //    como o próprio PowerPoint grava — o Office no Windows recusa alguns pacotes fora desse padrão.
  const final = new JSZip();
  const nomes = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir)
    .sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
  for (const n of nomes) final.file(n, await zip.files[n]!.async("uint8array"), { createFolders: false });
  return final.generateAsync({ type: "blob", mimeType: PRESENTACAO, compression: "DEFLATE" });
}

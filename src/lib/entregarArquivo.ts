// Entrega um arquivo gerado no navegador: abre o compartilhamento nativo no celular ou baixa no computador.
export async function entregarArquivo(blob: Blob, nome: string) {
  const file = new File([blob], nome, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nome }); return; }
    catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

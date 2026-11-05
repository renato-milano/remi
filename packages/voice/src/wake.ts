/**
 * "Hey Remi" riconosciuto sulla trascrizione di whisper (locale). Tarato su voce
 * reale: whisper scrive la frase come "Ehi Remy", "Hey Remy", "Ehi Rami", "Remy, …".
 * La forma "e i remi" (= "e i remi della barca") NON vale: sarebbe un falso allarme.
 */
const WAKE =
  /^[\s"'«(\-*]*(?:(?:hey|hei|ehi|ehy|ei|ey|eh|ok|okay)[\s,.!]+)?(?:r[eé]m[iìy]|rimi|rimy|rami|remmi)\b[\s,.!?:;-]*/i;

/**
 * Se il testo inizia con "Hey Remi", restituisce ciò che segue (la domanda, anche
 * vuota); altrimenti undefined.
 */
export function matchWakePhrase(text: string): string | undefined {
  // via le etichette dei suoni di sottofondo che whisper aggiunge: "[Musica] Ehi Remy!"
  const clean = text
    .replace(/\[[^\]]*\]|\*[^*]*\*|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = clean.match(WAKE);
  if (m) return clean.slice(m[0].length).trim();
  // "e i remi" vale solo se detto DA SOLO (un "Hey Remi" a cui segue una pausa);
  // con altre parole dopo è una frase normale ("e i remi della barca")
  if (ALONE.test(clean)) return '';
  return undefined;
}

/** "E i remi.", "E remi!": la trascrizione di un "Hey Remi" isolato. */
const ALONE = /^(?:e|ehi|hey|ei)?[\s,]*(?:i\s+)?(?:r[eé]m[iìy]|rimi|rami)[\s.!?]*$/i;

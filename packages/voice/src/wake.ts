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
  const m = text.trim().match(WAKE);
  return m ? text.trim().slice(m[0].length).trim() : undefined;
}

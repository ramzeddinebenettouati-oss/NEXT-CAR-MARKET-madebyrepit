const EMAIL_RE = /[\w.+\-]+@[\w\-]+\.[\w.]{2,}/gi;
const PHONE_RE =
  /(?:(?:\+|00)\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,5}/g;
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const HANDLE_RE =
  /(?:whatsapp|wechat|telegram|viber|line|skype|kakao|zalo)[:\s]*[\w\-+@.]+/gi;

const MASK = "[CONTACT INFORMATION REMOVED]";

export function scrubContactInfo(text: string): string {
  return text
    .replace(EMAIL_RE, MASK)
    .replace(URL_RE, MASK)
    .replace(HANDLE_RE, MASK)
    .replace(PHONE_RE, MASK);
}

export function hasContactInfo(text: string): boolean {
  return (
    EMAIL_RE.test(text) ||
    URL_RE.test(text) ||
    HANDLE_RE.test(text) ||
    PHONE_RE.test(text)
  );
}

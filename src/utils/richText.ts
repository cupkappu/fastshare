const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;
const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\uFEFF]/g;
const MAX_INLINE_IMAGE_BYTES = 512 * 1024;

export interface RichTextStats {
  textLength: number;
  imageCount: number;
}

export function sanitizeRichText(html: string): string {
  if (!html) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const container = document.createElement('div');

  Array.from(doc.body.childNodes).forEach((node) => {
    appendSanitizedNode(container, node);
  });

  return normalizeRichTextHtml(container.innerHTML);
}

export function normalizeRichTextHtml(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  if (isVisuallyEmpty(container)) {
    return '';
  }

  return container.innerHTML.replace(ZERO_WIDTH_CHARACTERS, '');
}

export function getRichTextStats(html: string): RichTextStats {
  if (!html) {
    return {
      textLength: 0,
      imageCount: 0
    };
  }

  const container = document.createElement('div');
  container.innerHTML = sanitizeRichText(html);

  return {
    textLength: (container.textContent || '').replace(ZERO_WIDTH_CHARACTERS, '').length,
    imageCount: container.querySelectorAll('img').length
  };
}

export function plainTextToHtml(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .split(/\r?\n/)
    .map((line) => `<div>${escapeHtml(line) || '<br>'}</div>`)
    .join('');
}

export async function fileToInlineImageDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('只能粘贴图片文件');
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  if (estimateDataUrlBytes(originalDataUrl) <= MAX_INLINE_IMAGE_BYTES) {
    return originalDataUrl;
  }

  if (file.type === 'image/gif') {
    throw new Error('GIF 图片过大，暂时无法直接内嵌');
  }

  for (const attempt of [
    { maxDimension: 1280, quality: 0.85 },
    { maxDimension: 960, quality: 0.78 },
    { maxDimension: 720, quality: 0.72 }
  ]) {
    const compressedDataUrl = await compressImage(file, attempt.maxDimension, attempt.quality);
    if (estimateDataUrlBytes(compressedDataUrl) <= MAX_INLINE_IMAGE_BYTES) {
      return compressedDataUrl;
    }
  }

  throw new Error('图片过大，当前仅支持压缩后 512KB 以内的内嵌图片');
}

function appendSanitizedNode(parent: HTMLElement, node: ChildNode) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').replace(ZERO_WIDTH_CHARACTERS, '');
    if (text) {
      parent.appendChild(document.createTextNode(text));
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'br') {
    parent.appendChild(document.createElement('br'));
    return;
  }

  if (tagName === 'img') {
    const src = element.getAttribute('src') || '';
    if (SAFE_IMAGE_DATA_URL.test(src)) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = element.getAttribute('alt') || 'Pasted image';
      parent.appendChild(img);
    }
    return;
  }

  if (tagName === 'div' || tagName === 'p') {
    const block = document.createElement('div');
    Array.from(element.childNodes).forEach((child) => {
      appendSanitizedNode(block, child);
    });
    if (!block.childNodes.length) {
      block.appendChild(document.createElement('br'));
    }
    parent.appendChild(block);
    return;
  }

  Array.from(element.childNodes).forEach((child) => {
    appendSanitizedNode(parent, child);
  });
}

function isVisuallyEmpty(container: HTMLElement): boolean {
  const hasImage = container.querySelector('img') !== null;
  const text = (container.textContent || '').replace(ZERO_WIDTH_CHARACTERS, '').trim();
  return !hasImage && !text;
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File, maxDimension: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const largestSide = Math.max(image.naturalWidth, image.naturalHeight, 1);
      const scale = Math.min(1, maxDimension / largestSide);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('浏览器不支持图片压缩'));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(objectUrl);
      resolve(dataUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('压缩图片失败'));
    };

    image.src = objectUrl;
  });
}

/** Decode through an image element too, for mobile browsers without createImageBitmap. */
export async function preparePhoto(file: File): Promise<File> {
  if (file.size > 40 * 1024 * 1024) throw new Error('Escolha uma foto de até 40 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Não foi possível abrir esta foto. Tente uma imagem JPEG, PNG ou WebP.'));
      image.src = url;
    });
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto neste navegador.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('Não foi possível reduzir a foto. Escolha uma imagem menor.');
    return new File([blob], 'aluguel.jpg', {type: 'image/jpeg'});
  } finally { URL.revokeObjectURL(url); }
}

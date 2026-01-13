import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

export interface OptimizeOptions {
  quality?: number;
  outputDir?: string;
  keepOriginal?: boolean;
  format?: 'webp' | 'png' | 'jpg';
}

export interface OptimizeResult {
  inputPath: string;
  outputPath: string;
  originalSize: number;
  optimizedSize: number;
  reduction: number;
  success: boolean;
  error?: string;
}

/**
 * Otimiza uma única imagem convertendo para WebP
 */
export async function optimizeImage(
  inputPath: string,
  options: OptimizeOptions = {}
): Promise<OptimizeResult> {
  const {
    quality = 75,
    outputDir,
    keepOriginal = false,
    format = 'webp',
  } = options;

  try {
    // Verifica se o arquivo existe
    await fs.access(inputPath);

    // Obtém informações do arquivo original
    const stats = await fs.stat(inputPath);
    const originalSize = stats.size;

    // Determina o caminho de saída
    const inputDir = path.dirname(inputPath);
    const inputName = path.basename(inputPath, path.extname(inputPath));
    const outputExtension = format === 'jpg' ? 'jpg' : format;
    const outputPath = outputDir
      ? path.join(outputDir, `${inputName}.${outputExtension}`)
      : path.join(inputDir, `${inputName}.${outputExtension}`);

    // Cria o diretório de saída se não existir
    if (outputDir) {
      await fs.mkdir(outputDir, { recursive: true });
    }

    // Processa a imagem baseado no formato selecionado
    let sharpInstance = sharp(inputPath);
    
    if (format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality, effort: 6 });
    } else if (format === 'png') {
      // PNG não usa quality, apenas compressionLevel (0-9)
      const compressionLevel = Math.round((100 - quality) / 11.11); // Converte quality (0-100) para compressionLevel (0-9)
      sharpInstance = sharpInstance.png({ compressionLevel: Math.min(9, Math.max(0, compressionLevel)) });
    } else if (format === 'jpg') {
      sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
    }

    await sharpInstance.toFile(outputPath);

    // Obtém o tamanho do arquivo otimizado
    const optimizedStats = await fs.stat(outputPath);
    const optimizedSize = optimizedStats.size;
    const reduction = ((originalSize - optimizedSize) / originalSize) * 100;

    // Remove o arquivo original se solicitado
    const inputExt = path.extname(inputPath).toLowerCase();
    const outputExt = `.${outputExtension}`;
    if (!keepOriginal && inputExt !== outputExt) {
      await fs.unlink(inputPath);
    }

    return {
      inputPath,
      outputPath,
      originalSize,
      optimizedSize,
      reduction: Math.round(reduction * 100) / 100,
      success: true,
    };
  } catch (error) {
    return {
      inputPath,
      outputPath: '',
      originalSize: 0,
      optimizedSize: 0,
      reduction: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Otimiza múltiplas imagens em lote
 */
export async function optimizeBatch(
  inputPaths: string[],
  options: OptimizeOptions = {}
): Promise<OptimizeResult[]> {
  const results: OptimizeResult[] = [];

  for (const inputPath of inputPaths) {
    const result = await optimizeImage(inputPath, options);
    results.push(result);
  }

  return results;
}

/**
 * Encontra todas as imagens em um diretório
 */
export async function findImagesInDirectory(
  dirPath: string,
  recursive: boolean = true
): Promise<string[]> {
  const supportedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
  const images: string[] = [];

  async function scanDirectory(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory() && recursive) {
        await scanDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          images.push(fullPath);
        }
      }
    }
  }

  await scanDirectory(dirPath);
  return images;
}

/**
 * Formata bytes para formato legível
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}


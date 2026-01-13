import type { VercelRequest, VercelResponse } from '@vercel/node';
import { IncomingForm } from 'formidable';
import { promises as fs } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { optimizeImage, type OptimizeResult } from '../src/optimizer.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuração para Vercel (usar /tmp para arquivos temporários)
const tempDir = '/tmp/optimize';
const maxFileSize = 50 * 1024 * 1024; // 50MB

// Configuração para Vercel Serverless Functions
export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Cria diretório temporário
    await fs.mkdir(tempDir, { recursive: true });

    // Parse do form data
    const form = new IncomingForm({
      uploadDir: tempDir,
      keepExtensions: true,
      maxFileSize,
      multiples: true,
    });

    const { fields, files } = await new Promise<{
      fields: any;
      files: any;
    }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const quality = parseInt((fields.quality as string)?.[0] || '75', 10);
    const format = ((fields.format as string)?.[0] || 'webp') as 'webp' | 'png' | 'jpg';
    const fileArray = Array.isArray(files.images) ? files.images : files.images ? [files.images] : [];

    if (fileArray.length === 0) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada' });
    }

    // Processa todas as imagens
    const results: OptimizeResult[] = [];
    const optimizedFiles: string[] = [];

    for (const file of fileArray) {
      const filePath = (file as any).filepath || (file as any).path;
      if (!filePath) continue;

      try {
        const result = await optimizeImage(filePath, {
          quality,
          format,
          outputDir: tempDir,
          keepOriginal: false,
        });

        results.push(result);

        if (result.success) {
          optimizedFiles.push(result.outputPath);
        }

        // Remove arquivo temporário original
        try {
          await fs.unlink(filePath);
        } catch (error) {
          // Ignora erros
        }
      } catch (error) {
        console.error(`Erro ao processar ${(file as any).originalFilename}:`, error);
        results.push({
          inputPath: filePath,
          outputPath: '',
          originalSize: 0,
          optimizedSize: 0,
          reduction: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    if (optimizedFiles.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma imagem foi processada com sucesso',
        details: results.map((r) => ({
          file: r.inputPath,
          error: r.error || 'Erro desconhecido',
        })),
      });
    }

    // Cria arquivo ZIP em memória
    const chunks: Buffer[] = [];
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Adiciona arquivos ao ZIP
    for (const filePath of optimizedFiles) {
      try {
        await fs.access(filePath);
        const fileName = path.basename(filePath);
        archive.file(filePath, { name: fileName });
      } catch (error) {
        console.error(`Arquivo não encontrado: ${filePath}`, error);
      }
    }

    await archive.finalize();

    // Aguarda todos os chunks
    await new Promise<void>((resolve) => {
      archive.on('end', resolve);
    });

    const zipBuffer = Buffer.concat(chunks);

    // Limpa arquivos temporários
    for (const filePath of optimizedFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ignora erros
      }
    }

    // Envia o ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="imagens-otimizadas-${Date.now()}.zip"`
    );
    res.setHeader('Content-Length', zipBuffer.length.toString());

    return res.send(zipBuffer);
  } catch (error) {
    console.error('Erro ao processar imagens:', error);
    return res.status(500).json({
      error: 'Erro ao processar imagens',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}


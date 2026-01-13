import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import archiver from 'archiver';
import { optimizeImage, formatBytes, type OptimizeResult } from './optimizer.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = process.env.BASE_PATH || '/';
let vite: any = null;

// Cria diretórios necessários
const uploadsDir = path.join(__dirname, '../uploads');
const tempDir = path.join(__dirname, '../temp');
const publicDir = path.join(__dirname, '../dist/public');
const isProduction = process.env.NODE_ENV === 'production';

// Configuração do multer para upload temporário
const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB por arquivo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens PNG, JPEG, JPG e WebP são permitidas!'));
    }
  },
});

// Cria diretórios se não existirem
(async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(tempDir, { recursive: true });
    console.log('✅ Diretórios criados/verificados');
  } catch (error) {
    console.error('❌ Erro ao criar diretórios:', error);
  }
})();

// Middleware para parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para servir arquivos estáticos no path base
if (isProduction) {
  app.use(BASE_PATH, express.static(publicDir));
}

// Middleware para tratar erros do multer
const handleMulterError = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Arquivo muito grande. Tamanho máximo: 50MB' });
      return;
    }
    res.status(400).json({ error: `Erro no upload: ${err.message}` });
    return;
  }
  if (err) {
    res.status(400).json({ error: err.message || 'Erro ao fazer upload do arquivo' });
    return;
  }
  next();
};

// Rota de upload e otimização
app.post(`${BASE_PATH}/optimize`, upload.array('images', 50), handleMulterError, async (req: express.Request, res: express.Response) => {
  console.log('📥 Recebido pedido de otimização');
  
  const quality = parseInt(req.body.quality || '75', 10);
  const format = (req.body.format || 'webp') as 'webp' | 'png' | 'jpg';
  const keepOriginal = req.body.keepOriginal === 'true';

  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    console.log('❌ Nenhuma imagem enviada');
    return res.status(400).json({ error: 'Nenhuma imagem foi enviada' });
  }

  const files = req.files;
  console.log(`📸 Processando ${files.length} imagem(ns) no formato ${format}`);
  const zipPath = path.join(tempDir, `optimized-${Date.now()}.zip`);

  // Declara variáveis fora do try para uso no catch
  const results: OptimizeResult[] = [];
  let optimizedFiles: string[] = [];

  try {
    // Cria diretório temporário se não existir
    await fs.mkdir(tempDir, { recursive: true });

    // Processa todas as imagens

    for (const file of files) {
      try {
        const result = await optimizeImage(file.path, {
          quality,
          format,
          outputDir: tempDir,
          keepOriginal: false,
        });

        results.push(result);

        if (result.success) {
          optimizedFiles.push(result.outputPath);
        } else {
          console.error(`Erro ao processar ${file.originalname}:`, result.error);
        }

        // Remove arquivo temporário original
        try {
          await fs.unlink(file.path);
        } catch (error) {
          // Ignora erros ao remover arquivo temporário
        }
      } catch (error) {
        console.error(`Erro ao processar ${file.originalname}:`, error);
        results.push({
          inputPath: file.path,
          outputPath: '',
          originalSize: 0,
          optimizedSize: 0,
          reduction: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        
        // Remove arquivo temporário original em caso de erro
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          // Ignora erros ao remover arquivo temporário
        }
      }
    }

    // Verifica se pelo menos uma imagem foi processada com sucesso
    if (optimizedFiles.length === 0) {
      console.log('❌ Nenhuma imagem foi processada com sucesso');
      console.log('Detalhes dos erros:', results);
      return res.status(400).json({
        error: 'Nenhuma imagem foi processada com sucesso',
        details: results.map(r => ({
          file: r.inputPath,
          error: r.error || 'Erro desconhecido'
        }))
      });
    }

    console.log(`✅ ${optimizedFiles.length} imagem(ns) processada(s) com sucesso`);

    // Cria arquivo ZIP
    const output = fsSync.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Máxima compressão
    });

    const zipPromise = new Promise<void>((resolve, reject) => {
      let responseSent = false;

      const sendError = (error: any) => {
        if (responseSent) return;
        responseSent = true;
        console.error('Erro no ZIP:', error);
        res.status(500).json({
          error: 'Erro ao criar arquivo ZIP',
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        reject(error);
      };

      output.on('close', async () => {
        if (responseSent) return;
        
        try {
          const stats = await fs.stat(zipPath);
          const zipSize = stats.size;

          if (zipSize === 0) {
            return sendError(new Error('O arquivo ZIP foi criado vazio'));
          }

          // Envia o arquivo ZIP
          responseSent = true;
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="imagens-otimizadas-${Date.now()}.zip"`
          );
          res.setHeader('Content-Length', zipSize);

          const stream = fsSync.createReadStream(zipPath);
          stream.pipe(res);

          stream.on('end', async () => {
            // Limpa arquivos temporários
            try {
              for (const file of optimizedFiles) {
                await fs.unlink(file).catch(() => {});
              }
              await fs.unlink(zipPath).catch(() => {});
            } catch (error) {
              console.error('Erro ao limpar arquivos temporários:', error);
            }
            resolve();
          });

          stream.on('error', (err) => {
            console.error('Erro ao enviar ZIP:', err);
            // Não rejeita aqui pois a resposta já foi enviada
          });
        } catch (error) {
          sendError(error);
        }
      });

      output.on('error', (err) => {
        sendError(err);
      });

      archive.on('error', (err) => {
        sendError(err);
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn('Aviso do archiver:', err);
        } else {
          sendError(err);
        }
      });

      archive.pipe(output);

      // Adiciona arquivos otimizados ao ZIP
      (async () => {
        try {
          for (const filePath of optimizedFiles) {
            try {
              // Verifica se o arquivo existe antes de adicionar
              await fs.access(filePath);
              const fileName = path.basename(filePath);
              archive.file(filePath, { name: fileName });
            } catch (error) {
              console.error(`Arquivo não encontrado: ${filePath}`, error);
            }
          }
          archive.finalize();
        } catch (error) {
          sendError(error);
        }
      })();
    });

    // Garante que erros não tratados sejam capturados
    zipPromise.catch((error) => {
      console.error('Erro não tratado no Promise do ZIP:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Erro ao processar imagens',
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    });

    return zipPromise;
  } catch (error) {
    // Limpa arquivos temporários em caso de erro
    try {
      for (const file of files) {
        await fs.unlink(file.path).catch(() => {});
      }
      if (results && results.length > 0) {
        const optimizedFiles = results
          .filter((r: OptimizeResult) => r.success)
          .map((r: OptimizeResult) => r.outputPath);
        for (const file of optimizedFiles) {
          await fs.unlink(file).catch(() => {});
        }
      }
      await fs.unlink(zipPath).catch(() => {});
    } catch (cleanupError) {
      console.error('Erro na limpeza:', cleanupError);
    }

    console.error('Erro ao processar imagens:', error);
    
    // Garante que uma resposta seja enviada
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Erro ao processar imagens',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      });
    }
  }
});

// Middleware de tratamento de erros global
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Erro não tratado:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: err.message || 'Erro desconhecido',
    });
  }
});

// Rota de status/health check
app.get(`${BASE_PATH}/health`, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Configura Vite e inicia servidor
(async () => {
  if (!isProduction) {
    try {
      vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
        root: path.join(__dirname, '..'),
        base: BASE_PATH,
      });
      // Vite middleware deve vir depois das rotas da API
      app.use(BASE_PATH, vite.middlewares);
      console.log('✅ Vite inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar Vite:', error);
    }
  } else {
    // Em produção, serve arquivos estáticos no path base
    app.get(`${BASE_PATH}/*`, (req, res) => {
      const filePath = req.path.replace(BASE_PATH, '') || '/index.html';
      res.sendFile(path.join(publicDir, filePath));
    });
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📁 Interface disponível em http://localhost:${PORT}${BASE_PATH}`);
    console.log(`📂 Uploads: ${uploadsDir}`);
    console.log(`📂 Temp: ${tempDir}`);
    console.log(`🔗 Base path: ${BASE_PATH}`);
    if (!isProduction) {
      console.log(`⚡ Vite em modo desenvolvimento`);
    }
  });
})();


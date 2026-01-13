#!/usr/bin/env node

import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import {
  optimizeImage,
  optimizeBatch,
  findImagesInDirectory,
  formatBytes,
  type OptimizeResult,
} from './optimizer.js';

const program = new Command();

program
  .name('image-optimizer')
  .description('Otimizador de imagens com conversão para WebP')
  .version('1.0.0');

program
  .command('optimize')
  .description('Otimiza uma imagem ou diretório de imagens')
  .argument('<input>', 'Caminho da imagem ou diretório')
  .option('-q, --quality <number>', 'Qualidade da imagem (0-100)', '75')
  .option('-o, --output <dir>', 'Diretório de saída (opcional)')
  .option('-k, --keep-original', 'Mantém o arquivo original', false)
  .option('--no-recursive', 'Não processa subdiretórios recursivamente')
  .action(async (input, options) => {
    try {
      const quality = parseInt(options.quality, 10);
      if (quality < 0 || quality > 100) {
        console.error('❌ Qualidade deve estar entre 0 e 100');
        process.exit(1);
      }

      const stats = await fs.stat(input);
      let results: OptimizeResult[] = [];
      const recursive = options.recursive !== false; // Padrão é true

      if (stats.isDirectory()) {
        console.log('📁 Processando diretório:', input);
        const images = await findImagesInDirectory(input, recursive);
        
        if (images.length === 0) {
          console.log('⚠️  Nenhuma imagem encontrada no diretório');
          return;
        }

        console.log(`📸 Encontradas ${images.length} imagem(ns)`);
        results = await optimizeBatch(images, {
          quality,
          outputDir: options.output,
          keepOriginal: options.keepOriginal,
        });
      } else if (stats.isFile()) {
        console.log('🖼️  Processando imagem:', input);
        const result = await optimizeImage(input, {
          quality,
          outputDir: options.output,
          keepOriginal: options.keepOriginal,
        });
        results = [result];
      } else {
        console.error('❌ Caminho inválido');
        process.exit(1);
      }

      // Exibe resultados
      console.log('\n📊 Resultados:');
      console.log('─'.repeat(80));

      let totalOriginal = 0;
      let totalOptimized = 0;
      let successCount = 0;

      for (const result of results) {
        if (result.success) {
          successCount++;
          totalOriginal += result.originalSize;
          totalOptimized += result.optimizedSize;

          console.log(`✅ ${path.basename(result.inputPath)}`);
          console.log(`   Original: ${formatBytes(result.originalSize)}`);
          console.log(`   Otimizado: ${formatBytes(result.optimizedSize)}`);
          console.log(`   Redução: ${result.reduction}%`);
          console.log(`   Saída: ${result.outputPath}`);
        } else {
          console.log(`❌ ${path.basename(result.inputPath)}`);
          console.log(`   Erro: ${result.error}`);
        }
        console.log('');
      }

      if (successCount > 0) {
        const totalReduction = ((totalOriginal - totalOptimized) / totalOriginal) * 100;
        console.log('─'.repeat(80));
        console.log(`📈 Total:`);
        console.log(`   Original: ${formatBytes(totalOriginal)}`);
        console.log(`   Otimizado: ${formatBytes(totalOptimized)}`);
        console.log(`   Redução total: ${Math.round(totalReduction * 100) / 100}%`);
        console.log(`   Imagens processadas: ${successCount}/${results.length}`);
      }
    } catch (error) {
      console.error('❌ Erro:', error instanceof Error ? error.message : 'Erro desconhecido');
      process.exit(1);
    }
  });

program.parse();


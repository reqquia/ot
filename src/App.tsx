import { useState, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, Download, Settings, Sparkles } from 'lucide-react';
import { Button } from './ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/components/card';
import { Progress } from './ui/components/progress';
import { Slider } from './ui/components/slider';
import { useToast } from './ui/components/use-toast';
import { Toaster } from './ui/components/toaster';

interface FileWithPreview extends File {
  preview?: string;
}

function App() {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [quality, setQuality] = useState(75);
  const [format, setFormat] = useState<'webp' | 'png' | 'jpg'>('webp');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleFiles = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const validFiles = Array.from(selectedFiles).filter((file) => {
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      return validTypes.includes(file.type);
    });

    if (validFiles.length === 0) {
      toast({
        title: 'Arquivo inválido',
        description: 'Apenas imagens PNG, JPEG, JPG e WebP são permitidas',
        variant: 'destructive',
      });
      return;
    }

    const filesWithPreview = validFiles.map((file) => {
      const fileWithPreview = Object.assign(file, {
        preview: URL.createObjectURL(file),
      });
      return fileWithPreview;
    });

    setFiles((prev) => [...prev, ...filesWithPreview]);
  }, [toast]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleOptimize = async () => {
    if (files.length === 0) {
      toast({
        title: 'Nenhuma imagem selecionada',
        description: 'Por favor, selecione pelo menos uma imagem',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('images', file);
    });
    formData.append('quality', quality.toString());
    formData.append('format', format);
    formData.append('keepOriginal', 'false');

    try {
      setProgress(30);
      // Vite automaticamente define import.meta.env.BASE_URL baseado no base config
      const basePath = import.meta.env.BASE_URL || '/';
      // Na Vercel, a API route está em /api/optimize, localmente em /ot/optimize
      const isVercel = window.location.hostname.includes('vercel.app') || window.location.hostname.includes('vercel.com');
      const optimizeUrl = isVercel 
        ? '/api/optimize' 
        : `${basePath}/optimize`.replace(/\/+/g, '/');
      const response = await fetch(optimizeUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Erro ao processar imagens';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json();
            errorMessage = error.error || error.message || errorMessage;
          } else {
            const text = await response.text();
            errorMessage = text || errorMessage;
          }
        } catch (parseError) {
          // Se não conseguir fazer parse, usa a mensagem padrão ou status
          errorMessage = `Erro ${response.status}: ${response.statusText || errorMessage}`;
        }
        throw new Error(errorMessage);
      }

      setProgress(90);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `imagens-otimizadas-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setProgress(100);

      toast({
        title: 'Sucesso!',
        description: `${files.length} imagem(ns) otimizada(s) e baixada(s) com sucesso!`,
      });

      setTimeout(() => {
        setFiles([]);
        setProgress(0);
        setIsProcessing(false);
      }, 2000);
    } catch (error) {
      setIsProcessing(false);
      setProgress(0);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="shadow-lg border-2">
          <CardHeader className="text-center space-y-3 pb-6">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-8 h-8 text-primary" />
              <CardTitle className="text-4xl font-bold">
                Otimizador de Imagens
              </CardTitle>
            </div>
            <CardDescription className="text-base">
              Otimize imagens convertendo para WebP, PNG ou JPG com qualidade personalizada
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Upload Area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => document.getElementById('file-input')?.click()}
              className={`
                relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer 
                transition-all duration-200
                ${isDragging 
                  ? 'border-primary bg-primary/5 scale-[1.02]' 
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50'
                }
              `}
            >
              <div className="flex flex-col items-center gap-4">
                <div className={`
                  p-4 rounded-full bg-primary/10 transition-all
                  ${isDragging ? 'scale-110' : ''}
                `}>
                  <Upload className={`w-8 h-8 text-primary transition-all ${isDragging ? 'animate-bounce' : ''}`} />
                </div>
                <div>
                  <p className="text-lg font-semibold mb-1">
                    {isDragging ? 'Solte as imagens aqui' : 'Arraste suas imagens aqui'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ou clique para selecionar arquivos
                  </p>
                </div>
              </div>
              <input
                id="file-input"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {/* File List */}
            {files.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Arquivos selecionados ({files.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border border-border hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="p-2 rounded bg-primary/10">
                            <ImageIcon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(file.size)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="w-5 h-5" />
                  Configurações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Qualidade da imagem</label>
                    <span className="text-sm font-semibold text-primary">{quality}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Menor tamanho</span>
                    <span>Melhor qualidade</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-medium">Formato de saída</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="format"
                        value="webp"
                        checked={format === 'webp'}
                        onChange={(e) => setFormat(e.target.value as 'webp' | 'png' | 'jpg')}
                        className="w-4 h-4 text-primary focus:ring-primary"
                      />
                      <span className="text-sm">WebP</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="format"
                        value="png"
                        checked={format === 'png'}
                        onChange={(e) => setFormat(e.target.value as 'webp' | 'png' | 'jpg')}
                        className="w-4 h-4 text-primary focus:ring-primary"
                      />
                      <span className="text-sm">PNG</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="format"
                        value="jpg"
                        checked={format === 'jpg'}
                        onChange={(e) => setFormat(e.target.value as 'webp' | 'png' | 'jpg')}
                        className="w-4 h-4 text-primary focus:ring-primary"
                      />
                      <span className="text-sm">JPG</span>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progress */}
            {isProcessing && (
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Processando imagens...</span>
                    <span className="font-semibold text-primary">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </CardContent>
              </Card>
            )}

            {/* Optimize Button */}
            <Button
              onClick={handleOptimize}
              disabled={files.length === 0 || isProcessing}
              className="w-full h-12 text-base font-semibold"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                  Processando...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Otimizar e Baixar ZIP
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </div>
  );
}

export default App;

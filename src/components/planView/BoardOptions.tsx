import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Settings, Download, Upload, UsersRound, ThumbsUp } from 'lucide-react';

export interface BoardTypeConfig {
    type: 'fertilization' | 'dream';
    exportData: () => Record<string, unknown>;
    importData: (data: Record<string, unknown>) => Promise<void>;
}

interface BoardOptionsProps {
    showOfflineVotesPanel: boolean;
    onToggleOfflineVotesPanel: (show: boolean) => void;
    boardConfig: BoardTypeConfig;
    isModerator: boolean;
}

export const BoardOptions: React.FC<BoardOptionsProps> = ({
    showOfflineVotesPanel,
    onToggleOfflineVotesPanel,
    boardConfig,
    isModerator,
}) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importWarningAccepted, setImportWarningAccepted] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = () => {
        try {
            setIsExporting(true);
            const data = boardConfig.exportData();
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `p3fo-${boardConfig.type}-board.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        } catch (error) {
            console.error('Error exporting board:', error);
            alert(t('boardOptions.exportFailed', { error: error instanceof Error ? error.message : String(error) }));
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImportFile(e.target.files[0]);
            setImportWarningAccepted(false);
        }
    };

    const handleImport = async () => {
        if (!importFile) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            if (e.target?.result) {
                try {
                    setIsImporting(true);
                    const importedData = JSON.parse(e.target.result as string);
                    await boardConfig.importData(importedData);
                    alert(t('boardOptions.importSuccess'));
                    window.location.reload();
                } catch (error) {
                    console.error('Import error:', error);
                    alert(t('boardOptions.importFailed', { error: error instanceof Error ? error.message : String(error) }));
                } finally {
                    setIsImporting(false);
                    setImportDialogOpen(false);
                    setImportFile(null);
                    setImportWarningAccepted(false);
                }
            }
        };
        reader.readAsText(importFile);
    };

    if (!isModerator) return null;

    return (
        <>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                        <Settings className="h-4 w-4" />
                        {t('boardOptions.options')}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                    <div className="space-y-3">
                        <h4 className="font-medium text-sm">{t('boardOptions.title')}</h4>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm">
                                <UsersRound className="h-4 w-4" />
                                <span>{t('boardOptions.offlineVotes')}</span>
                            </div>
                            <Button
                                variant={showOfflineVotesPanel ? 'default' : 'outline'}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => onToggleOfflineVotesPanel(!showOfflineVotesPanel)}
                            >
                                <ThumbsUp className="h-3 w-3 mr-1" />
                                {showOfflineVotesPanel ? t('boardOptions.on') : t('boardOptions.off')}
                            </Button>
                        </div>

                        <div className="border-t pt-3 space-y-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full justify-start gap-2"
                                onClick={handleExport}
                                disabled={isExporting}
                            >
                                <Download className="h-4 w-4" />
                                {isExporting ? t('boardOptions.exporting') : t('boardOptions.exportJson')}
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full justify-start gap-2"
                                onClick={() => {
                                    setIsOpen(false);
                                    setImportDialogOpen(true);
                                }}
                            >
                                <Upload className="h-4 w-4" />
                                {t('boardOptions.importBoard')}
                            </Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('boardOptions.importTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('boardOptions.importDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {!importWarningAccepted ? (
                            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
                                <h4 className="font-semibold text-destructive">{t('boardOptions.warningTitle')}</h4>
                                <p className="text-sm text-muted-foreground">
                                    {t('boardOptions.warningBody', { type: boardConfig.type === 'fertilization' ? t('boardOptions.fertilization') : t('boardOptions.dream') })}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {t('boardOptions.warningBackup')}
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setImportWarningAccepted(true)}
                                    >
                                        {t('boardOptions.understand')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setImportDialogOpen(false)}
                                    >
                                        {t('common.cancel')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center space-x-2">
                                    <Input
                                        type="file"
                                        accept=".json"
                                        onChange={handleImportFileSelect}
                                        ref={fileInputRef}
                                    />
                                </div>
                                {importFile && (
                                    <div className="text-sm text-muted-foreground">
                                        {t('boardOptions.selected')}: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)
                                    </div>
                                )}
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => {
                                        setImportDialogOpen(false);
                                        setImportFile(null);
                                        setImportWarningAccepted(false);
                                    }}>
                                        {t('common.cancel')}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={handleImport}
                                        disabled={!importFile || isImporting}
                                    >
                                        {isImporting ? t('boardOptions.importing') : t('boardOptions.importReplace')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
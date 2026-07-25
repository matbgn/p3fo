import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { applyImportedData, extractImportErrorMessage, CURRENT_SCHEMA_VERSION } from '@/lib/apply-imported-data';

const DataImporter: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          try {
            const importedData = JSON.parse(e.target.result as string);

            // Schema version check
            if (importedData.schemaVersion !== undefined && importedData.schemaVersion > CURRENT_SCHEMA_VERSION) {
              toast({
                variant: 'destructive',
                title: t('dataImport.unsupportedSchemaTitle'),
                description: t('dataImport.unsupportedSchemaDescription', { v: importedData.schemaVersion, max: CURRENT_SCHEMA_VERSION }),
              });
              return;
            }

            // Old format: just an array of tasks → wrap so the shared engine
            // handles it uniformly.
            const payload = Array.isArray(importedData) ? { tasks: importedData } : importedData;

            await applyImportedData(payload);

            toast({
              title: t('dataImport.successTitle'),
              description: t('dataImport.successDescription'),
            });
            // Trigger a reload or state update if necessary
            window.location.reload();
          } catch (error) {
            console.error("Import error:", error);
            const message = extractImportErrorMessage(error, t);
            toast({
              variant: 'destructive',
              title: t('dataImport.errorTitle'),
              description: message,
            });
          }
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Input type="file" onChange={handleFileChange} />
      <Button onClick={handleImport} disabled={!file}>
        {t('dataImport.button')}
      </Button>
    </div>
  );
};

export default DataImporter;
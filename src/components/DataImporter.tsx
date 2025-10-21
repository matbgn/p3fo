import React, { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReminderStore } from '@/hooks/useReminders';

const DataImporter: React.FC = () => {
  const { importTasks } = useTasks();
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          try {
            const importedData = JSON.parse(e.target.result as string);

            if (Array.isArray(importedData)) {
              // Old format: just an array of tasks
              importTasks(importedData);
            } else if (importedData.tasks) {
              // New format
              importTasks(importedData.tasks);
              if (importedData.scheduledReminders) {
                useReminderStore.getState().setScheduledReminders(importedData.scheduledReminders);
                // Clean up any duplicate reminders
                useReminderStore.getState().cleanupDuplicateReminders();
                // Trigger a check for any reminders that should be shown now
                useReminderStore.getState().checkAndTriggerReminders();
              }
              if (importedData.qolSurveyResponse) {
                localStorage.setItem('qolSurveyResponse', JSON.stringify(importedData.qolSurveyResponse));
              }
              if (importedData.settings) {
                for (const [key, value] of Object.entries(importedData.settings)) {
                  if (value) {
                    localStorage.setItem(key, value as string);
                  }
                }
              }
            }
            
            alert('Data imported successfully!');
          } catch (error) {
            alert('Error importing tasks. Please check the file format.');
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
        Import Data
      </Button>
    </div>
  );
};

export default DataImporter;

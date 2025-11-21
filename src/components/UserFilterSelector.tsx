import React, { useEffect, useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { usePersistence } from '@/lib/PersistenceProvider';
import { UserSettingsEntity } from '@/lib/persistence-types';
import { Label } from '@/components/ui/label';

interface UserFilterSelectorProps {
    selectedUserId?: string | null;
    onUserChange: (userId: string | null) => void;
    className?: string;
}

const ALL_USERS_VALUE = 'ALL_USERS';
const UNASSIGNED_VALUE = 'UNASSIGNED';

export const UserFilterSelector: React.FC<UserFilterSelectorProps> = ({
    selectedUserId,
    onUserChange,
    className,
}) => {
    const persistence = usePersistence();
    const [users, setUsers] = useState<UserSettingsEntity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const userList = await persistence.listUsers();
                setUsers(userList);
            } catch (error) {
                console.error('Error loading users:', error);
            } finally {
                setLoading(false);
            }
        };

        loadUsers();
    }, [persistence]);

    const handleValueChange = (value: string) => {
        if (value === ALL_USERS_VALUE) {
            onUserChange(null);
        } else {
            onUserChange(value);
        }
    };

    const currentValue = selectedUserId || ALL_USERS_VALUE;

    return (
        <div className="flex items-center space-x-2">
            <Label>User:</Label>
            <Select value={currentValue} onValueChange={handleValueChange} disabled={loading}>
                <SelectTrigger className={className || "w-40"}>
                    <SelectValue placeholder={loading ? 'Loading...' : 'All Users'} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ALL_USERS_VALUE}>All Users</SelectItem>
                    <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                    {users.map((user) => (
                        <SelectItem key={user.userId} value={user.userId}>
                            {user.username}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};

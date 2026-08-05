import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UserRecord {
  id: number;
  username: string;
  full_name: string;
  role: string;
  active: boolean;
}

export default function UsersView() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("vendedor");
  const [active, setActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    try {
      const data = await invoke<UserRecord[]>("list_users");
      setUsers(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setFullName("");
    setRole("vendedor");
    setActive(true);
    setNewPassword("");
    setError("");
    setEditing(null);
  };

  const openNew = () => { resetForm(); setShowForm(true); };
  const openEdit = (u: UserRecord) => {
    setEditing(u);
    setUsername(u.username);
    setFullName(u.full_name);
    setRole(u.role);
    setActive(u.active);
    setPassword("");
    setNewPassword("");
    setError("");
    setShowForm(true);
  };

  const save = async () => {
    if (editing) {
      if (!fullName.trim()) { setError("El nombre completo es obligatorio"); return; }
      try {
        await invoke("update_user", {
          id: editing.id,
          fullName,
          role,
          active,
          newPassword: newPassword || null,
        });
        setShowForm(false); resetForm(); loadUsers();
      } catch (e) { setError(String(e)); }
    } else {
      if (!username.trim() || !password.trim() || !fullName.trim()) {
        setError("Usuario, contraseña y nombre completo son obligatorios");
        return;
      }
      try {
        await invoke("create_user", {
          username,
          password,
          fullName,
          role,
        });
        setShowForm(false); resetForm(); loadUsers();
      } catch (e) { setError(String(e)); }
    }
  };

  const deleteUser = async (id: number) => {
    if (confirm("¿Eliminar este usuario permanentemente?")) {
      try {
        await invoke("delete_user", { id });
        loadUsers();
      } catch (e) { alert(String(e)); }
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Usuarios</h2>
        <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-primary px-4 py-2 rounded-lg transition">+ Nuevo usuario</button>
      </div>

      <div className="bg-card border border-theme rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-input text-primary text-sm">
            <tr>
              <th className="p-3">Usuario</th>
              <th className="p-3">Nombre completo</th>
              <th className="p-3">Rol</th>
              <th className="p-3">Activo</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {users.map((u) => (
              <tr key={u.id} className="border-t border-theme hover:bg-input/50">
                <td className="p-3">{u.username}</td>
                <td className="p-3">{u.full_name}</td>
                <td className="p-3">{u.role}</td>
                <td className="p-3">{u.active ? "✅" : "❌"}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => openEdit(u)} className="text-blue-400 hover:text-blue-300">Editar</button>
                  <button onClick={() => deleteUser(u.id)} className="text-red-400 hover:text-red-300">Eliminar</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-secondary">No hay usuarios registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-theme rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">{editing ? "Editar usuario" : "Nuevo usuario"}</h3>
            <div className="space-y-3">
              {!editing && (
                <div>
                  <label className="block text-sm text-secondary">Usuario *</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
                </div>
              )}
              <div>
                <label className="block text-sm text-secondary">Nombre completo *</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
              </div>
              <div>
                <label className="block text-sm text-secondary">Rol</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary">
                  <option value="admin">Administrador</option>
                  <option value="subadmin">Subadministrador</option>
                  <option value="vendedor">Vendedor</option>
                  <option value="asistente">Asistente</option>
                </select>
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} id="active" />
                  <label htmlFor="active" className="text-sm text-secondary">Usuario activo</label>
                </div>
              )}
              {!editing && (
                <div>
                  <label className="block text-sm text-secondary">Contraseña *</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
                </div>
              )}
              {editing && (
                <div>
                  <label className="block text-sm text-secondary">Nueva contraseña (dejar vacío para no cambiar)</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
                </div>
              )}
              {error && <div className="p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">{error}</div>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted hover:bg-gray-600 rounded-lg text-primary">Cancelar</button>
              <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-primary">{editing ? "Actualizar" : "Crear"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import supabase from '../lib/supabase';

const AdminInventoryManagement = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    prod_name: '',
    category: '',
    price: '',
    stock_quantity: '',
    image_url: ''
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('product')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Fetch error:", error.message);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  const handleFileUpload = async (event) => {
    try {
      setUploading(true);
      const file = event.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to 'product-images' bucket (Make sure this bucket exists in Supabase)
      let { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setFormData({ ...formData, image_url: data.publicUrl });
    } catch (error) {
      alert('Error uploading image: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('product').insert([
      { 
        prod_name: formData.prod_name,
        category: formData.category,
        price: parseFloat(formData.price),
        stock_quantity: parseInt(formData.stock_quantity),
        image_url: formData.image_url
      }
    ]);

    if (!error) {
      setFormData({ prod_name: '', category: '', price: '', stock_quantity: '', image_url: '' });
      setShowForm(false);
      fetchProducts();
    } else {
      alert(error.message);
    }
  };

  // Calculated Stats
  const totalProducts = products.length;
  const lowStockCount = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 10).length;
  const outOfStockCount = products.filter(p => p.stock_quantity <= 0).length;

  return (
    <div className="space-y-6 p-6 bg-white min-h-screen">
      {/* Header & Stats */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-black uppercase tracking-tight">Inventory Management</h2>
          <p className="text-sm text-gray-500 font-medium">Monitoring stock levels and availability.</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn bg-yellow-500 border-none text-black hover:bg-yellow-600 font-bold"
        >
          {showForm ? 'Close Form' : '+ Add New Product'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl shadow-sm">
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Total Products</p>
          <p className="text-3xl font-black text-black">{totalProducts}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl shadow-sm">
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Low Stock</p>
          <p className="text-3xl font-black text-yellow-600">{lowStockCount}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl shadow-sm">
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Out of Stock</p>
          <p className="text-3xl font-black text-red-600">{outOfStockCount}</p>
        </div>
      </div>

      {/* Input Form */}
      {showForm && (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-300 shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="label text-xs font-bold uppercase text-black">Product Name</label>
                <input name="prod_name" value={formData.prod_name} onChange={(e) => setFormData({...formData, prod_name: e.target.value})} type="text" className="input input-bordered w-full bg-white text-black border-gray-400 focus:border-black" required />
              </div>
              <div>
                <label className="label text-xs font-bold uppercase text-black">Category</label>
                <input name="category" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} type="text" className="input input-bordered w-full bg-white text-black border-gray-400 focus:border-black" required />
              </div>
              <div>
                <label className="label text-xs font-bold uppercase text-black">Price (₱)</label>
                <input name="price" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} type="number" className="input input-bordered w-full bg-white text-black border-gray-400 focus:border-black" required />
              </div>
              <div>
                <label className="label text-xs font-bold uppercase text-black">Stock</label>
                <input name="stock_quantity" value={formData.stock_quantity} onChange={(e) => setFormData({...formData, stock_quantity: e.target.value})} type="number" className="input input-bordered w-full bg-white text-black border-gray-400 focus:border-black" required />
              </div>
              <div>
                <label className="label text-xs font-bold uppercase text-black">Product Image</label>
                <input type="file" onChange={handleFileUpload} className="file-input file-input-bordered w-full bg-white text-black border-gray-400" />
              </div>
            </div>
            <button type="submit" disabled={uploading} className="btn btn-block bg-black text-white hover:bg-gray-800 border-none uppercase tracking-widest font-bold">
              {uploading ? 'Uploading Image...' : 'Register Product to Inventory'}
            </button>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
        <table className="table w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-black uppercase text-xs">Visual</th>
              <th className="text-black uppercase text-xs">Product</th>
              <th className="text-black uppercase text-xs">Category</th>
              <th className="text-black uppercase text-xs">Price</th>
              <th className="text-black uppercase text-xs">Stock</th>
              <th className="text-black uppercase text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center py-10 font-bold text-gray-400">LOADING INVENTORY...</td></tr>
            ) : products.map((item) => (
              <tr key={item.prod_id} className="hover:bg-gray-50 border-b border-gray-100">
                <td>
                  <div className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden flex items-center justify-center">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400">N/A</span>
                    )}
                  </div>
                </td>
                <td className="font-bold text-black">{item.prod_name}</td>
                <td><span className="bg-gray-100 px-2 py-1 rounded text-xs font-semibold text-black uppercase tracking-tighter">{item.category}</span></td>
                <td className="text-black font-semibold">₱{item.price.toLocaleString()}</td>
                <td className="text-black">{item.stock_quantity}</td>
                <td>
                  {item.stock_quantity <= 0 ? (
                    <span className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-[10px] font-black uppercase">Out</span>
                  ) : item.stock_quantity <= 10 ? (
                    <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-600 text-[10px] font-black uppercase">Low</span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-green-100 text-green-600 text-[10px] font-black uppercase">In Stock</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminInventoryManagement;
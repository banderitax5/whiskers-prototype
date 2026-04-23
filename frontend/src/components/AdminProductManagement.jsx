import React, { useState, useEffect } from 'react';
import supabase from '../lib/supabase';

const AdminProductManagement = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
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
    
    if (!error) setProducts(data);
    setLoading(false);
  }

  const handleFileUpload = async (event) => {
    try {
      setUploading(true);
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to 'product-images' bucket
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
        image_url: formData.image_url // Ensure this column exists in your table
      }
    ]);

    if (!error) {
      setFormData({ prod_name: '', category: '', price: '', stock_quantity: '', image_url: '' });
      setShowForm(false);
      await fetchProducts();
    } else {
      alert(error.message);
    }
  };

  return (
    <div className="p-6 bg-white min-h-screen text-black">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Product Management</h1>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn bg-yellow-500 border-none text-black hover:bg-yellow-600 font-bold"
        >
          {showForm ? 'Cancel' : '+ New Product'}
        </button>
      </div>

      {showForm && (
        <div className="mb-8 p-6 bg-gray-100 rounded-2xl border border-gray-300 shadow-inner">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="form-control">
                <label className="label text-xs font-bold text-gray-700">PRODUCT NAME</label>
                <input 
                  name="prod_name" 
                  value={formData.prod_name} 
                  onChange={(e) => setFormData({...formData, prod_name: e.target.value})}
                  className="input input-bordered bg-white text-black border-gray-400 focus:border-black" 
                  required 
                />
              </div>
              <div className="form-control">
                <label className="label text-xs font-bold text-gray-700">CATEGORY</label>
                <input 
                  name="category" 
                  value={formData.category} 
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="input input-bordered bg-white text-black border-gray-400" 
                  required 
                />
              </div>
              <div className="form-control">
                <label className="label text-xs font-bold text-gray-700">PRICE (₱)</label>
                <input 
                  type="number" 
                  value={formData.price} 
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="input input-bordered bg-white text-black border-gray-400" 
                  required 
                />
              </div>
              <div className="form-control">
                <label className="label text-xs font-bold text-gray-700">IMAGE UPLOAD</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileUpload}
                  className="file-input file-input-bordered bg-white text-black border-gray-400 w-full"
                />
                {uploading && <span className="text-xs mt-1 animate-pulse">Uploading...</span>}
              </div>
            </div>
            <button type="submit" disabled={uploading} className="btn btn-block bg-black text-white hover:bg-gray-800 border-none">
              {uploading ? 'Processing Image...' : 'Save Product'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="table w-full">
          <thead className="bg-gray-50">
            <tr className="text-gray-600 border-b border-gray-200">
              <th className="py-4">Image</th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center py-10">Loading...</td></tr>
            ) : (
              products.map((item) => (
                <tr key={item.prod_id} className="border-b border-gray-100 hover:bg-gray-50 text-black">
                  <td>
                    <div className="avatar">
                      <div className="mask mask-squircle w-12 h-12 bg-gray-200">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.prod_name} />
                        ) : (
                          <div className="flex items-center justify-center h-full text-[10px] text-gray-400 uppercase">No Img</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="font-bold">{item.prod_name}</td>
                  <td><span className="badge badge-ghost text-black">{item.category}</span></td>
                  <td className="font-semibold">₱{item.price.toLocaleString()}</td>
                  <td>{item.stock_quantity}</td>
                  <td>
                    <span className={`badge border-none font-bold text-[10px] ${item.stock_quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {item.stock_quantity > 0 ? 'ACTIVE' : 'OUT'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminProductManagement;
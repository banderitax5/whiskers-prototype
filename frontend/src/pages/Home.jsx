import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import ProductQuickViewDialog from '../components/ProductQuickViewDialog.jsx'

// the home page shows category tiles and product rows
// filter controls were moved to the dedicated user menu page
function Home() {
  const navigate = useNavigate()
  const { addToCart } = useShop()
  const [activeProduct, setActiveProduct] = useState(null)
  // product categories - each product belongs to one of these
  // the displayName is what shows up on the page (uppercase for style)
  const categories = [
    {
      id: 1,
      name: "best seller",
      displayName: "BEST SELLERS"
    },
    {
      id: 2,
      name: "new arrivals",
      displayName: "NEW ARRIVALS"
    }
  ];

  // hardcoded product list - categoryId links each product to a category above
  // prices are in PHP, images are in the public/categoryshop folder
  const products = [
    { id: 1, name: "Pet Goats Powder Milk", price: 200.00, image: "/categoryshop/dog.jpg", categoryId: 2 },
    { id: 2, name: "Ciao Can Treats", price: 150.00, image: "/categoryshop/cat.jpg", categoryId: 1 },
    { id: 3, name: "Premium Dog Food", price: 350.00, image: "/categoryshop/dog.png", categoryId: 1 },
    { id: 4, name: "Cat Vitamins", price: 280.00, image: "/categoryshop/fish.png", categoryId: 2 },
    { id: 5, name: "Bird Cage Accessories", price: 450.00, image: "/categoryshop/berd.jpg", categoryId: 1 },
    { id: 6, name: "Automatic Pet Feeder", price: 1200.00, image: "/categoryshop/feeder.jpg", categoryId: 2 },
    { id: 7, name: "Aquarium Filter System", price: 550.00, image: "/categoryshop/fish.webp", categoryId: 1 },
    { id: 8, name: "Pet Grooming Kit", price: 320.00, image: "/categoryshop/all.png", categoryId: 2 },
    { id: 9, name: "Dog Training Treats", price: 180.00, image: "/categoryshop/all.jpeg", categoryId: 1 },
    { id: 10, name: "Cat Scratching Post", price: 650.00, image: "/categoryshop/cat.jpg", categoryId: 2 },
    { id: 11, name: "Pet Carrier Bag", price: 420.00, image: "/categoryshop/dog.jpg", categoryId: 1 },
    { id: 12, name: "Fish Tank Decorations", price: 250.00, image: "/categoryshop/fish.png", categoryId: 2 },
    { id: 13, name: "Bird Seed Mix", price: 120.00, image: "/categoryshop/berd.jpg", categoryId: 1 },
    { id: 14, name: "Pet Bed Premium", price: 850.00, image: "/categoryshop/feeder.jpg", categoryId: 2 },
  ];

  const getCategoryById = (categoryId) => categories.find(cat => cat.id === categoryId);
  const getProductsByCategory = (categoryId) => products.filter(product => product.categoryId === categoryId);

  const categoryTiles = [
    { id: 'food', label: 'FOOD', image: '/categoryshop/dog.jpg' },
    { id: 'vitamins', label: 'VITAMINS', image: '/categoryshop/cat.jpg' },
    { id: 'accessories', label: 'ACCESSORIES', image: '/categoryshop/fish.png' },
    { id: 'cages', label: 'CAGES', image: '/categoryshop/berd.jpg' },
  ]

  function handleAddToCart(product, qty = 1) {
    addToCart(product, qty)
  }

  function handleBuyNow(product, qty = 1) {
    addToCart(product, qty)
    navigate('/cart')
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="mx-auto max-w-7xl px-4 pt-2">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-3">Categories</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {categoryTiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              className="h-24 sm:h-28 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm px-3 sm:px-4 flex items-center justify-center gap-3 sm:gap-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <img src={tile.image} alt={tile.label} className="h-12 w-12 sm:h-14 sm:w-14 object-cover" />
              <span className="text-[11px] sm:text-xs font-semibold text-gray-700 dark:text-gray-200 tracking-wide">
                {tile.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {categories.map((category) => {
        const categoryProducts = getProductsByCategory(category.id);
        return (
          <div key={category.id} className="mx-auto mt-6 max-w-7xl px-4 sm:mt-8 md:mt-10">
            <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 tracking-wide">{category.displayName}</h2>
              <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline text-xs sm:text-sm font-semibold uppercase whitespace-nowrap">VIEW ALL</a>
            </div>
            <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 sm:pb-4 scrollbar-hide snap-x snap-mandatory touch-pan-x scroll-smooth">
              {categoryProducts.slice(0, 7).map((product) => {
                const productCategory = getCategoryById(product.categoryId);
                return (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveProduct(product)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setActiveProduct(product)
                    }}
                    className="snap-start flex-shrink-0 w-44 sm:w-52 md:w-56 lg:w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden cursor-pointer"
                  >
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 flex items-center justify-center h-32 sm:h-36 md:h-40">
                      <img src={product.image} alt={product.name} className="max-h-full max-w-full object-contain"/>
                    </div>
                    <div className="p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                      {productCategory && (
                        <span className="inline-block bg-red-800 text-white text-[10px] sm:text-xs font-semibold px-2 py-1 rounded-full leading-tight">
                          {productCategory.displayName}
                        </span>
                      )}
                      <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight min-h-[2.5rem]">{product.name}</p>
                      <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">PHP {product.price.toFixed(2)}</p>
                    </div>
                    <div className="p-3 sm:p-4 pt-0 space-y-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddToCart(product)
                        }}
                        className="w-full bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-gray-900 font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors touch-manipulation min-h-[40px]"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span className="whitespace-nowrap">ADD TO CART</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleBuyNow(product)
                        }}
                        className="w-full bg-[#0b2e59] hover:bg-[#15407a] text-white font-semibold py-2.5 rounded-md text-xs sm:text-sm transition-colors min-h-[40px]"
                      >
                        BUY NOW
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <ProductQuickViewDialog
        product={activeProduct}
        isOpen={Boolean(activeProduct)}
        onClose={() => setActiveProduct(null)}
        onAddToCart={(product, qty) => handleAddToCart(product, qty)}
        onBuyNow={(product, qty) => handleBuyNow(product, qty)}
      />
    </div>
  )
}

export default Home

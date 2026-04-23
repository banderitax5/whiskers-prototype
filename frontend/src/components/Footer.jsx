import React from "react";

function Footer() {
  return (
    <footer className="bg-gray-100 dark:bg-[#031730] py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <nav>
            <h6 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-white">
              Start Shopping
            </h6>
            <ul className="space-y-2 text-sm">
              <li><a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">Dog</a></li>
              <li><a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">Cat</a></li>
              <li><a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">Bird</a></li>
              <li><a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">Small Pet</a></li>
            </ul>
          </nav>

          <nav>
            <h6 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-white">
              Support
            </h6>
            <ul className="space-y-2 text-sm">
              <li><a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">My Account</a></li>
              <li><a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">Payment</a></li>
              <li><a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">Returns</a></li>
              <li><a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">FAQs</a></li>
            </ul>
          </nav>

          <nav>
            <h6 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-white">
              Social
            </h6>
            <div className="flex gap-4">
              <a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="fill-current">
  <path d="M12448. 2H21l-6.51 7.44L22 22h-6.828l-5.35-7.02L3.5 22H1l6.96-7.96L2 2h6.828l4.86 6.4L18.244 2zm-2.392 18h1.88L8.36 4h-2l9.492 16z"/>
</svg>
              </a>
              <a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="fill-current">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                </svg>
              </a>
              <a className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="fill-current">
                  <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
                </svg>
              </a>
            </div>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

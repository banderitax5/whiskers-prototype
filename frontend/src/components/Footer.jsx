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
              
              {/* Instagram */}
              <a
                href="https://www.instagram.com/petcareswhiskers?igsh=aTN5NXN3Mm5nbXV1&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="fill-current">
                  <path d="M7.75 2C4.574 2 2 4.574 2 7.75v8.5C2 19.426 4.574 22 7.75 22h8.5C19.426 22 22 19.426 22 16.25v-8.5C22 4.574 19.426 2 16.25 2h-8.5zm0 2h8.5C18.216 4 20 5.784 20 7.75v8.5c0 1.966-1.784 3.75-3.75 3.75h-8.5C5.784 20 4 18.216 4 16.25v-8.5C4 5.784 5.784 4 7.75 4zm8.75 1.5a1 1 0 100 2 1 1 0 000-2zM12 7a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z"/>
                </svg>
              </a>

              {/* Facebook */}
              <a
                href="https://www.facebook.com/profile.php?id=61561539844519"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              >
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

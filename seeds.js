const mongoose = require("mongoose");
const Campground = require("./models/campground");
const Comment   = require("./models/comment");
 
const seeds = [
    {
        name: "Cloud's Rest", 
        image: "https://farm4.staticflickr.com/3795/10131087094_c1c0a1c859.jpg",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum",
		author:{
				id : "5f76c15527c8ca085ec65fb3",
				username: "HI"
				}
    },
    {
        name: "Desert Mesa", 
        image: "https://farm6.staticflickr.com/5487/11519019346_f66401b6c1.jpg",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum",
		author:{
				id : "5f76c15527c8ca085ec65fb3",
				username: "HI"
				}
    },
    {
        name: "Canyon Floor", 
        image: "https://farm1.staticflickr.com/189/493046463_841a18169e.jpg",
        description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum",
		author:{
				id : "5f76c15527c8ca085ec65fb3",
				username: "HI"
				}
    }
];

// Async lets you run code in a synchronous manner, i.e., run code in a specific order.
// Await waits for that code to run before we continue. 
//Wrap the code in a 'Try, Catch' to catch any errors while running this code.

async function seedDB(){
	try {
		//Remove all campgrounds and comments
		await Campground.deleteMany({});
		console.log("deleted a campground");
	   await Comment.deleteMany({});
		console.log("deleted a comment");

	//'For Of Loop' for each item ('seed') in the 'seeds' array, do this...
	   for(const seed of seeds) {
	//create a campground for each seed using the 'Campground' model. 
			let campground = await Campground.create(seed);
		   console.log("campground created");
	//create a comment using the 'Comment' model.
			let comment = await Comment.create(
				{
                    text: "This place is great, but I wish there was internet",
                    author:{
                            id : "5f76c15527c8ca085ec65fb3",
                            username: "HI"
                			}
				})  
	//Push each comment into the campground.comments array, then save.			 
			console.log("comment created");
			campground.comments.push(comment);
		   console.log("comment saved in campground array");
		    campground.save();
		   console.log("campground saved")
	   }
	} catch(err) {
		console.log(err);
	}
}
  
module.exports = seedDB;           

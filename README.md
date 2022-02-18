## A cli program to config and upload lesson data to FireStore for [typingchild.com](http://www.typingchild.com).

### Commands
- To install <br/> 
`yarn park`
- upload lessons to emulator <br/>
`tpadmin uploadlessons -e true`
- upload lessons to production env <br/>
`tpadmin uploadlessons`
- To update configs to emulator (e.g as follows)<br/>
`tpadmin updateConfig -e true -d true --newLessonsIds="1,2,3"`
- To update configs to production env <br/>
`tpadmin updateConfig -d true --newLessonsIds="1,3,4"`
